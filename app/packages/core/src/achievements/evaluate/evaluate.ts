// Evaluates the achievements of one keeper (US-ACH-01). Pure and derived on every request: nothing is stored but the
// "seen" state (FR-ACH-02). An open achievement names its next step, or what data is missing, never "failed" (P-08, P-09).
import type { AchievementFacts, AchievementStatus } from "../types";
import { ACHIEVEMENT_DEFINITIONS } from "./definitions";

/** One status per definition, in the fixed order of the definitions. `today` is the keeper's local date (NFR-08). */
export function evaluateAchievements(
  facts: AchievementFacts,
  today: string,
): readonly AchievementStatus[] {
  return ACHIEVEMENT_DEFINITIONS.map((def) => {
    const outcome = def.criterion(facts, today);
    const base = { id: def.id, group: def.group, version: def.version } as const;
    if ("earned" in outcome) {
      return {
        ...base,
        earned: true,
        earnedOn: outcome.earned.earnedOn,
        specimenId: outcome.earned.specimenId,
        nextStep: null,
        missing: null,
      };
    }
    return {
      ...base,
      earned: false,
      earnedOn: null,
      specimenId: null,
      nextStep: { key: `${def.id}.next`, specimenId: outcome.open.specimenId },
      missing: outcome.open.missing,
    };
  });
}
