// Public interface of the module `achievements` (ADR 0014, epic ACH): achievements derived from the keeper's own data.
export { evaluateAchievements } from "./evaluate/evaluate";
export { achievementOverview } from "./evaluate/overview";
export type { AchievementOverview, OverviewGroup } from "./evaluate/overview";
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
export {
  DEFAULT_ACHIEVEMENT_SETTINGS,
  achievementsSetCalmMode,
  readAchievementSettings,
  showsAchievements,
} from "./settings/settings";
export type { AchievementSettings, AchievementSettingsStore } from "./settings/settings";
export { achievementsMarkSeen, reconcileSeen } from "./seen/seen";
export type {
  AchievementSeenState,
  AchievementSeenStore,
  AchievementMarkSeenDependencies,
  SeenReconciliation,
} from "./seen/seen";
export { growthMoments, RECORD_LIMITS } from "./records/records";
export type { GrowthMoment, GrowthMoments, RecordPoint } from "./records/records";
export { anniversaries, ANNIVERSARY_LIMITS } from "./anniversaries/anniversaries";
export type { Anniversary, AnniversarySpecimen } from "./anniversaries/anniversaries";
export { careRhythm, RHYTHM_LIMITS } from "./rhythm/rhythm";
export type {
  CareRhythm,
  RhythmPause,
  RhythmTask,
  RhythmWeek,
  RhythmWeekState,
} from "./rhythm/rhythm";
