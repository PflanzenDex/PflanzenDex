// Lock states as pure domain logic (US-ONB-04, FR-ONB-01): derived live from counts, dates and settings, never
// stored. No I/O and no clock: today's local date comes in (NFR-08). Reasons and ways are data; the German text comes
// from a message table (FR-QG-11).
import { appError, daysBetween, failed, ok, type FeatureSet, type Result } from "../../../kernel";
import {
  isUnlockFunctionId,
  UNLOCK_FUNCTIONS,
  UNLOCK_RULES,
  type UnlockCondition,
  type UnlockFunction,
  type UnlockFunctionId,
} from "./unlock-registry";

export type KeeperStyle = "few" | "many";

/** `switched_off`: the operator's switch is off. `unlockable` is reserved for the keeper-may-open-now case of US-ONB-05. */
export type LockState = "open" | "locked" | "unlockable" | "switched_off";

export interface UnlockInput {
  /** Account setting (DM-ONB-01); persistence belongs to US-ONB-03. */
  readonly style: KeeperStyle;
  /** Active specimens. */
  readonly activeSpecimens: number;
  /** Local date `YYYY-MM-DD` of the first specimen ever created; `null` while there is none (NFR-08). */
  readonly firstSpecimenDate: string | null;
  /** Today's local date `YYYY-MM-DD`, passed in (NFR-08). */
  readonly today: string;
  readonly calmMode: boolean;
  /** Effective switches of the installation for this account (US-DEV-06). */
  readonly features: FeatureSet;
  /** Functions the keeper opened by tap (DM-ONB-02). */
  readonly manualUnlocks: ReadonlySet<string>;
  /** Functions whose data already exists, e.g. a wish, a friend, an invitation (P-10). */
  readonly existingData: ReadonlySet<string>;
}

/** One unmet or met condition as data: what is needed and what the account has. `have` is `null` when unknown (P-08). */
export type UnlockReason =
  | { readonly kind: "first_specimen" }
  | { readonly kind: "specimens"; readonly needed: number; readonly have: number }
  | {
      readonly kind: "days_since_first_specimen";
      readonly needed: number;
      readonly have: number | null;
    };

/** What opens the function: add plants, wait for a calendar date, or open it now (always possible, US-ONB-05). */
export type UnlockWay =
  | { readonly kind: "add_specimens"; readonly missing: number }
  | { readonly kind: "wait"; readonly days: number; readonly unlockDate: string }
  | { readonly kind: "add_first_specimen" };

export interface UnlockStatus {
  readonly id: UnlockFunctionId;
  readonly state: LockState;
  /** False when the function must not be announced at all: switched off, or hidden in calm mode (US-ONB-05). */
  readonly announced: boolean;
  /** Only while `locked`: the conditions of the rule, any one opens it. */
  readonly reasons: readonly UnlockReason[];
  /** Only while `locked`: one way per condition. */
  readonly ways: readonly UnlockWay[];
  /** Only while `locked`: the keeper may open it by tap even though the rule is not met (US-ONB-05). */
  readonly mayUnlockNow: boolean;
}

const MS_PER_DAY = 86_400_000;

/** Calendar date `days` after `date`, no clock and no zone. */
export function addDays(date: string, days: number): string {
  const d = new Date(Date.parse(`${date}T00:00:00Z`) + days * MS_PER_DAY);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())}`;
}

interface Evaluated {
  readonly met: boolean;
  readonly reason: UnlockReason;
  readonly way: UnlockWay;
}

function evaluate(c: UnlockCondition, i: UnlockInput): Evaluated {
  const hasFirst = i.firstSpecimenDate !== null || i.activeSpecimens > 0;
  if (c.kind === "first_specimen")
    return {
      met: hasFirst,
      reason: { kind: "first_specimen" },
      way: { kind: "add_first_specimen" },
    };
  if (c.kind === "specimens")
    return {
      met: i.activeSpecimens >= c.count,
      reason: { kind: "specimens", needed: c.count, have: i.activeSpecimens },
      way: { kind: "add_specimens", missing: Math.max(0, c.count - i.activeSpecimens) },
    };
  const first = i.firstSpecimenDate;
  const have = first === null ? null : daysBetween(first, i.today);
  const reason = { kind: "days_since_first_specimen", needed: c.days, have } as const;
  if (first === null) return { met: false, reason, way: { kind: "add_first_specimen" } };
  const unlockDate = addDays(first, c.days);
  return {
    met: daysBetween(first, i.today) >= c.days,
    reason,
    way: { kind: "wait", days: Math.max(0, daysBetween(i.today, unlockDate)), unlockDate },
  };
}

const status = (
  f: UnlockFunction,
  state: LockState,
  announced: boolean,
  extra = {},
): UnlockStatus => ({
  id: f.id as UnlockFunctionId,
  state,
  announced,
  reasons: [],
  ways: [],
  mayUnlockNow: false,
  ...extra,
});

function derive(f: UnlockFunction, i: UnlockInput): UnlockStatus {
  const announcedByCalm = !(f.hiddenInCalmMode && i.calmMode);
  if (f.feature && !i.features.has(f.feature)) return status(f, "switched_off", false);
  const conditions = UNLOCK_RULES[f.rule];
  if (conditions.length === 0 || i.style === "many") return status(f, "open", announcedByCalm);
  if (i.manualUnlocks.has(f.id) || i.existingData.has(f.id))
    return status(f, "open", announcedByCalm);
  const evaluated = conditions.map((c) => evaluate(c, i));
  if (evaluated.some((e) => e.met)) return status(f, "open", announcedByCalm);
  return status(f, "locked", announcedByCalm, {
    reasons: evaluated.map((e) => e.reason),
    ways: evaluated.map((e) => e.way),
    mayUnlockNow: true,
  });
}

/** The lock state of every function in registry (navigation) order. */
export const unlockStates = (input: UnlockInput): readonly UnlockStatus[] =>
  UNLOCK_FUNCTIONS.map((f) => derive(f, input));

/** The lock state of one function; an unknown id refuses with a stable code, nothing is silently open. */
export function unlockState(id: string, input: UnlockInput): Result<UnlockStatus> {
  const found = isUnlockFunctionId(id) ? UNLOCK_FUNCTIONS.find((f) => f.id === id) : undefined;
  return found
    ? ok(derive(found, input))
    : failed(appError("onboarding.unknown_function", { data: { id } }));
}
