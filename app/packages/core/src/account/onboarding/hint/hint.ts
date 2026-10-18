// Calm hints of the introduction (US-ONB-07, DM-ONB-03): short, rare, easy to dismiss. The occasions have fixed ids and
// a fixed order here; the texts are UI texts of the web app. A hint adds, it never blocks (FR-ONB-08): nothing the keeper
// looks for is held back, and calm mode or style `many` show no hint at all. Whether a hint is due is decided by this
// pure function from the stored dates (P-01); the clock is passed in (NFR-08).
import {
  appError,
  calendarDateField,
  defineOperation,
  failed,
  ok,
  shape,
  textField,
} from "../../../kernel";
import type { KeeperStyle } from "../unlock";

/** The occasions in the fixed order in which they show when more than one waits (US-ONB-07). */
export const HINT_OCCASIONS = [
  "first_plant_saved",
  "plant_without_place",
  "first_measurement",
  "function_unlocked",
] as const;
export type HintOccasion = (typeof HINT_OCCASIONS)[number];

/** "Einstieg beenden": the first-plant guide was finished, skipped or ended. Stored like a dismissed hint, never shown as one. */
export const FIRST_PLANT_GUIDE = "first_plant_guide";

/** Every id the store accepts. */
export const HINT_RECORD_IDS: readonly string[] = [...HINT_OCCASIONS, FIRST_PLANT_GUIDE];

/** Starting values (assumptions, decided by the PO, P-08). */
export const HINT_MAX_WORDS = 12;
export const HINT_VISIBLE_DAYS = 7;

/** What is stored for one occasion; dates are local calendar dates (NFR-08). */
export interface HintRecord {
  readonly occasion: string;
  readonly shownOn: string;
  readonly dismissedOn: string | null;
}

/** Port for persistence; the adapter lives in `db` and runs as the account of the caller (P-04). Rows are never deleted. */
export interface HintStore {
  list(userId: string): Promise<readonly HintRecord[]>;
  /** Stores that the hint was shown; the first date stays. Answers the stored row. */
  show(userId: string, occasion: string, on: string): Promise<HintRecord>;
  /** Stores the dismissal; a dismissal that exists keeps its first date. Answers the stored row. */
  dismiss(userId: string, occasion: string, on: string): Promise<HintRecord>;
}

const DAY = 86_400_000;
const days = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

/** True when the keeper dismissed the occasion (also the first-plant guide). */
export const isDismissed = (records: readonly HintRecord[], occasion: string): boolean =>
  records.some((r) => r.occasion === occasion && r.dismissedOn !== null);

export interface HintInput {
  /** Occasions that apply right now, as far as the caller knows the situation; the order does not matter. */
  readonly applicable: readonly string[];
  readonly records: readonly HintRecord[];
  readonly style: KeeperStyle;
  readonly calmMode: boolean;
  /** Today's local calendar date (NFR-08). */
  readonly today: string;
}

/**
 * The one hint that may show now, or `null` (US-ONB-07): none in calm mode or under style `many`; per occasion never
 * after a dismissal and never again once it was shown more than 7 days ago; at most one, the first in the fixed order.
 */
export function pickHint(i: HintInput): HintOccasion | null {
  if (i.calmMode || i.style === "many") return null;
  for (const occasion of HINT_OCCASIONS) {
    if (!i.applicable.includes(occasion)) continue;
    const record = i.records.find((r) => r.occasion === occasion);
    if (!record) return occasion;
    if (record.dismissedOn !== null) continue;
    if (days(record.shownOn, i.today) <= HINT_VISIBLE_DAYS) return occasion;
  }
  return null;
}

const schema = shape({
  occasion: textField("occasion", { min: 1, max: 40 }),
  on: calendarDateField("on"),
});

/** Records that a hint was shown (starts its 7 days); repeating it keeps the first date. Unknown occasion: refused. */
export const onboardingShowHint = (deps: { hints: HintStore }) =>
  defineOperation({
    name: "onboarding.show_hint",
    schema,
    run: async ({ userId }, { occasion, on }) =>
      HINT_RECORD_IDS.includes(occasion)
        ? ok(await deps.hints.show(userId, occasion, on))
        : failed(appError("onboarding.unknown_occasion", { data: { occasion } })),
  });

/** Records the dismissal ("Okay") or the end of the guide: the occasion never returns for this account (DM-ONB-03). */
export const onboardingDismissHint = (deps: { hints: HintStore }) =>
  defineOperation({
    name: "onboarding.dismiss_hint",
    schema,
    run: async ({ userId }, { occasion, on }) =>
      HINT_RECORD_IDS.includes(occasion)
        ? ok(await deps.hints.dismiss(userId, occasion, on))
        : failed(appError("onboarding.unknown_occasion", { data: { occasion } })),
  });
