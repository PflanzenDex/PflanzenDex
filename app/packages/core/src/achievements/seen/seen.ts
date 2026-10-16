// "New" achievements (US-ACH-03): only the seen state is stored per account on the server; `new` is derived live as
// earned minus seen (P-01, P-04, FR-ACH-02), like "newly caught" in the Pokédex (US-POK-12).
import {
  appError,
  defineOperation,
  failed,
  isTimeZone,
  ok,
  shape,
  type ErrorDetail,
} from "../../kernel";
import { ACHIEVEMENT_IDS } from "../types";

/**
 * What the server keeps per account (DM-ACH-02): the achievements the keeper has seen and the definitions the account
 * knew at its last write (FR-ACH-09). The instant of the last write is the "seen at" of the row.
 */
export interface AchievementSeenState {
  readonly seen: readonly string[];
  readonly known: readonly string[];
}

/** Port for persistence; the adapter lives in `db` and runs as the account of the caller (P-04). */
export interface AchievementSeenStore {
  /** `null` while the account has no seen state yet (first evaluation). */
  find(userId: string): Promise<AchievementSeenState | null>;
  /** Adds ids to `seen` and `known`, creating the state when missing; answers the whole state. */
  add(
    userId: string,
    seen: readonly string[],
    known: readonly string[],
  ): Promise<AchievementSeenState>;
}

export interface SeenReconciliation {
  /** Earned and not seen: the achievements that count as new. */
  readonly fresh: readonly string[];
  /** Earned but to be created silently as seen: the first evaluation, or a definition new to the account (FR-ACH-09). */
  readonly acknowledge: readonly string[];
  /** The stored state is behind (missing, or definitions it does not know): one write brings it up to date. */
  readonly needsWrite: boolean;
}

/**
 * Splits the earned achievements into new ones and ones to acknowledge silently. A missing state means the first
 * evaluation of an existing account: everything earned is created as seen, so no flood of banners (US-ACH-03). The same
 * goes for a definition the account did not know yet when its criterion was already met (FR-ACH-09); one that is not
 * met yet is learned, so it counts as new once it is earned.
 */
export function reconcileSeen(
  earned: readonly string[],
  state: AchievementSeenState | null,
  definitions: readonly string[] = ACHIEVEMENT_IDS,
): SeenReconciliation {
  if (state === null) return { fresh: [], acknowledge: [...earned], needsWrite: true };
  const known = new Set(state.known);
  const seen = new Set(state.seen);
  const unknown = new Set(definitions.filter((id) => !known.has(id)));
  const acknowledge = earned.filter((id) => unknown.has(id) && !seen.has(id));
  const fresh = earned.filter((id) => !seen.has(id) && !unknown.has(id));
  return { fresh, acknowledge, needsWrite: unknown.size > 0 };
}

/** Limit of the list (assumption, starting value): far above the number of definitions. */
const MAX_IDS = 200;

const schema = shape({
  achievements: (value: unknown): string[] | ErrorDetail => {
    const bad: ErrorDetail = { field: "achievements", code: "input.invalid" };
    if (!Array.isArray(value) || value.length > MAX_IDS) return bad;
    return value.every((k) => typeof k === "string" && k.length >= 1 && k.length <= 100)
      ? [...new Set(value as string[])]
      : bad;
  },
  timeZone: (value: unknown): string | ErrorDetail =>
    isTimeZone(value) ? value : { field: "timeZone", code: "input.invalid" },
});

export interface AchievementMarkSeenDependencies {
  readonly seen: AchievementSeenStore;
  /** The ids of the achievements the account has earned now, derived from its own data (adapter in `api`). */
  readonly earned: (userId: string, timeZone: string) => Promise<readonly string[]>;
}

/**
 * Marks achievements as seen (US-ACH-03, P-03): "Okay" in the overview sends the new ones, the first evaluation sends
 * the earned ones to create the state silently. Only earned achievements can be marked; anything else is refused
 * instead of dropped (P-10). The state only grows. Every write also records the current definitions as known, so a
 * definition added later is told apart from one the account has lived with (FR-ACH-09).
 */
export const achievementsMarkSeen = (deps: AchievementMarkSeenDependencies) =>
  defineOperation({
    name: "achievements.mark_seen",
    schema,
    run: async ({ userId }, input) => {
      const earned = new Set(await deps.earned(userId, input.timeZone));
      if (input.achievements.some((id) => !earned.has(id))) {
        return failed(appError("achievements.not_earned"));
      }
      return ok(await deps.seen.add(userId, input.achievements, ACHIEVEMENT_IDS));
    },
  });
