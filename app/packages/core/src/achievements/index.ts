// Public interface of the module `achievements` (ADR 0014, epic ACH): achievements derived from the keeper's own data.
export { evaluateAchievements } from "./evaluate/evaluate";
export { ACHIEVEMENT_DEFINITIONS } from "./evaluate/definitions";
export { ACHIEVEMENT_GROUPS, ACHIEVEMENT_IDS, ACHIEVEMENT_LIMITS } from "./types";
export type {
  AchievementFacts,
  AchievementGroup,
  AchievementId,
  AchievementStatus,
  AchievementHandoverFact,
  AchievementMeasurementFact,
  MissingData,
  NextStep,
  AchievementSpecimenFact,
  AchievementTreatmentFact,
} from "./types";
