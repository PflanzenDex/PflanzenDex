import {
  achievementOverview,
  evaluateAchievements,
  localToday,
  type AchievementStatus,
  type NextStep,
} from "@pflanzendex/core";
import { readAchievementFacts, type FactSources } from "./facts";

type Names = ReadonlyMap<string, string>;
const nameOf = (names: Names, id: string | null) => (id === null ? null : (names.get(id) ?? null));
const step = (names: Names, s: NextStep | null) =>
  s === null
    ? null
    : { key: s.key, specimenId: s.specimenId, specimenName: nameOf(names, s.specimenId) };
const item = (names: Names, s: AchievementStatus) => ({
  id: s.id,
  earnedOn: s.earnedOn,
  specimenId: s.specimenId,
  specimenName: nameOf(names, s.specimenId),
  nextStep: step(names, s.nextStep),
  missing: s.missing,
});

/**
 * The overview of the keeper (US-ACH-02): derived on every request from the keeper's own data (FR-ACH-02); nothing
 * but the facts leaves the module. No percentage of others, no total score (FR-ACH-04).
 */
export async function achievementsView(
  src: FactSources,
  userId: string,
  timeZone: string,
  now: Date,
) {
  const { facts, names } = await readAchievementFacts(src, userId, timeZone);
  const overview = achievementOverview(evaluateAchievements(facts, localToday(now, timeZone)));
  return {
    calmMode: false as const,
    earnedCount: overview.earnedCount,
    firstStep: step(names, overview.firstStep),
    groups: overview.groups.map((g) => ({
      group: g.group,
      earned: g.earned.map((s) => item(names, s)),
      open: g.open.map((s) => item(names, s)),
    })),
  };
}
