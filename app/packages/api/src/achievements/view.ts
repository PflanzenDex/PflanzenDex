import {
  achievementOverview,
  reconcileSeen,
  type AchievementSeenState,
  type AchievementStatus,
  type NextStep,
} from "@pflanzendex/core";
import type { FactSources } from "./facts";
import { readStatuses, type Keeper } from "./news";

type Names = ReadonlyMap<string, string>;
const nameOf = (names: Names, id: string | null) => (id === null ? null : (names.get(id) ?? null));
const step = (names: Names, s: NextStep | null) =>
  s === null
    ? null
    : { key: s.key, specimenId: s.specimenId, specimenName: nameOf(names, s.specimenId) };
const item = (names: Names, s: AchievementStatus, fresh: ReadonlySet<string>) => ({
  id: s.id,
  isNew: fresh.has(s.id),
  earnedOn: s.earnedOn,
  specimenId: s.specimenId,
  specimenName: nameOf(names, s.specimenId),
  nextStep: step(names, s.nextStep),
  missing: s.missing,
});

/**
 * The overview of the keeper (US-ACH-02): derived on every request from the keeper's own data (FR-ACH-02), with the new ones marked from the
 * seen state (US-ACH-03); nothing but the facts leaves the module. No percentage of others, no total score (FR-ACH-04).
 */
export async function achievementsView(
  src: FactSources,
  seen: AchievementSeenState | null,
  who: Keeper,
) {
  const { userId, timeZone, now } = who;
  const { statuses, names } = await readStatuses(src, userId, timeZone, now);
  const overview = achievementOverview(statuses);
  // New = earned minus seen (US-ACH-03); nothing counts as new before the state exists (silent first evaluation).
  const fresh = new Set(
    reconcileSeen(
      statuses.filter((s) => s.earned).map((s) => s.id),
      seen,
    ).fresh,
  );
  return {
    calmMode: false as const,
    earnedCount: overview.earnedCount,
    newCount: fresh.size,
    firstStep: step(names, overview.firstStep),
    groups: overview.groups.map((g) => ({
      group: g.group,
      earned: g.earned.map((s) => item(names, s, fresh)),
      open: g.open.map((s) => item(names, s, fresh)),
    })),
  };
}
