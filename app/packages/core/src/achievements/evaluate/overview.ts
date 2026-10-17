// The overview of the achievements (US-ACH-02). Pure: groups, order and the first step are derived from the statuses.
import { ACHIEVEMENT_GROUPS } from "../types";
import type { AchievementGroup, AchievementStatus, NextStep } from "../types";

export interface OverviewGroup {
  readonly group: AchievementGroup;
  /** Newest first by `earned on`; equal dates keep the fixed order of the definitions. */
  readonly earned: readonly AchievementStatus[];
  /** In the fixed order of the definitions, never ranked by an invented effort (P-08). */
  readonly open: readonly AchievementStatus[];
}

export interface AchievementOverview {
  /** Care, growth, swapping, collecting. "Collecting" has no achievement of its own: the Pokédex shows rank and milestones (POK). */
  readonly groups: readonly OverviewGroup[];
  readonly earnedCount: number;
  /**
   * With nothing earned yet: the next step of the first open achievement, so a new keeper sees what to do instead of an
   * empty list (P-09). `null` once something is earned. No percentage, no total score (FR-ACH-04).
   */
  readonly firstStep: NextStep | null;
}

/** The statuses arrive in the order of the definitions (`evaluateAchievements`). */
export function achievementOverview(statuses: readonly AchievementStatus[]): AchievementOverview {
  const groups = ACHIEVEMENT_GROUPS.map((group): OverviewGroup => {
    const own = statuses.filter((s) => s.group === group);
    const earned = own
      .map((s, i) => ({ s, i }))
      .filter((x) => x.s.earned)
      .sort((a, b) => (b.s.earnedOn ?? "").localeCompare(a.s.earnedOn ?? "") || a.i - b.i)
      .map((x) => x.s);
    return { group, earned, open: own.filter((s) => !s.earned) };
  });
  const earnedCount = statuses.filter((s) => s.earned).length;
  const firstStep = earnedCount === 0 ? (statuses.find((s) => !s.earned)?.nextStep ?? null) : null;
  return { groups, earnedCount, firstStep };
}
