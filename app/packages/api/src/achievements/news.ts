import {
  achievementOverview,
  evaluateAchievements,
  localToday,
  reconcileSeen,
  type AchievementSeenStore,
} from "@pflanzendex/core";
import { readAchievementFacts, type FactSources } from "./facts";

/** Whose achievements, in which time zone, at which instant. */
export interface Keeper {
  readonly userId: string;
  readonly timeZone: string;
  readonly now: Date;
}

/** The statuses of all achievements, derived from the keeper's own data (FR-ACH-02), with the specimen names. */
export async function readStatuses(src: FactSources, userId: string, timeZone: string, now: Date) {
  const { facts, names } = await readAchievementFacts(src, userId, timeZone);
  return { statuses: evaluateAchievements(facts, localToday(now, timeZone)), names };
}

/** The ids of the achievements the keeper has earned now (adapter of `achievements.mark_seen`). */
export async function earnedAchievementIds(
  src: FactSources,
  userId: string,
  timeZone: string,
  now: Date,
): Promise<string[]> {
  const { statuses } = await readStatuses(src, userId, timeZone, now);
  return statuses.filter((s) => s.earned).map((s) => s.id);
}

/**
 * What the banner and the overview need to know about "new" (US-ACH-03): the new achievements (earned minus seen) with
 * date and specimen, the ones to create silently as seen (first evaluation, FR-ACH-09) and whether one write is due.
 * Read-only; the client writes through `achievements.mark_seen` (P-03).
 */
export async function achievementsNews(
  src: FactSources,
  seen: Pick<AchievementSeenStore, "find">,
  who: Keeper,
) {
  const { userId, timeZone, now } = who;
  const { statuses, names } = await readStatuses(src, userId, timeZone, now);
  const earned = achievementOverview(statuses).groups.flatMap((g) => g.earned);
  const r = reconcileSeen(
    earned.map((s) => s.id),
    await seen.find(userId),
  );
  return {
    calmMode: false as const,
    fresh: earned
      .filter((s) => r.fresh.includes(s.id))
      .map((s) => ({
        id: s.id,
        earnedOn: s.earnedOn,
        specimenName: s.specimenId === null ? null : (names.get(s.specimenId) ?? null),
      })),
    acknowledge: r.acknowledge,
    needsWrite: r.needsWrite,
  };
}
