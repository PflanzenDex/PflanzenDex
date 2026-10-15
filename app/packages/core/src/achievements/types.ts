// Achievements (epic ACH, DM-ACH-01): vocabulary of the pure domain logic. Earned state and `earned on` are derived on
// every request from plain facts about the keeper's own data and are never stored (FR-ACH-02).

export const ACHIEVEMENT_GROUPS = ["care", "growth", "swapping", "collecting"] as const;
export type AchievementGroup = (typeof ACHIEVEMENT_GROUPS)[number];

/** Stable keys of the starting set (US-ACH-01, assumption, revisable). Ids are never reused. */
export const ACHIEVEMENT_IDS = [
  "first-measurement-photo",
  "cutting-rooted",
  "treatment-completed",
  "through-dormancy",
  "healthy-for-a-year",
  "first-handover",
] as const;
export type AchievementId = (typeof ACHIEVEMENT_IDS)[number];

/** Why an open achievement cannot be judged yet (P-08): data is missing, which is never "failed". */
export type MissingData =
  | "no_measurements"
  | "no_photo"
  | "too_few_measurements"
  | "no_treatment"
  | "no_catch_date"
  | "no_dormancy_period";

/** Starting values (assumptions): 4 measurements and 12 months for "healthy for a year" (US-ACH-01). */
export const ACHIEVEMENT_LIMITS = { healthyMeasurements: 4 } as const;

export interface SpecimenFact {
  readonly id: string;
  readonly name: string;
  /** Local calendar date the keeper caught the specimen (US-POK-07); `null` = unknown (P-08). */
  readonly caughtOn: string | null;
  /** Local calendar date of archiving; the event history of an archived specimen stays (P-10). */
  readonly archivedOn: string | null;
  /** Local calendar date a cutting was repotted into its own plant (US-BES-04); `null` = no such event. */
  readonly cuttingRootedOn: string | null;
  /** Effective dormancy period as `MM-DD` bounds (US-PHA-01); `null` = unknown. */
  readonly dormancy: { readonly from: string; readonly until: string } | null;
}

export interface MeasurementFact {
  readonly specimenId: string;
  /** Local calendar date `YYYY-MM-DD` (NFR-08). */
  readonly date: string;
  /** `etiolated` is "etiolated/thin" (US-WAC-02); it never counts as success (US-WAC-04). */
  readonly quality: "healthy" | "etiolated";
  readonly hasPhoto: boolean;
}

export interface TreatmentCourseFact {
  readonly specimenId: string;
  /** One entry per date of the course; `doneOn` is the local date it was ticked off, `null` = open (US-BEH-03). */
  readonly dates: readonly { readonly doneOn: string | null }[];
}

export interface HandoverFact {
  /** Local date of the handover confirmed by both sides (US-SOZ-11). */
  readonly date: string;
  readonly specimenId: string | null;
}

/** Plain facts about one keeper, assembled by an adapter from the keeper's own data only (P-04). */
export interface AchievementFacts {
  readonly specimens: readonly SpecimenFact[];
  readonly measurements: readonly MeasurementFact[];
  readonly treatmentCourses: readonly TreatmentCourseFact[];
  readonly handovers: readonly HandoverFact[];
}

/** The event that fulfilled a criterion. */
export interface Earned {
  readonly earnedOn: string;
  readonly specimenId: string | null;
}

/** The one action that would fulfil an open achievement (P-09); the German text lives in the message tables. */
export interface NextStep {
  readonly key: `${AchievementId}.next`;
  /** The specimen the action concerns, if one is meant (e.g. the course to finish). */
  readonly specimenId: string | null;
}

/** What a criterion answers: the earliest event, or what is missing, or neither (open, data complete). */
export type Outcome =
  | { readonly earned: Earned }
  | { readonly open: { readonly missing: MissingData | null; readonly specimenId: string | null } };

export interface Criterion {
  (facts: AchievementFacts, today: string): Outcome;
}

export interface AchievementDefinition {
  readonly id: AchievementId;
  readonly group: AchievementGroup;
  /** Bump when the criterion changes (FR-ACH-09). */
  readonly version: number;
  readonly criterion: Criterion;
}

export interface AchievementStatus {
  readonly id: AchievementId;
  readonly group: AchievementGroup;
  readonly version: number;
  readonly earned: boolean;
  /** Local calendar date of the event (NFR-08); `null` while open. */
  readonly earnedOn: string | null;
  /** Specimen that led to the achievement, for the link; `null` if none applies. */
  readonly specimenId: string | null;
  /** Set for open achievements only. */
  readonly nextStep: NextStep | null;
  /** Set for open achievements whose data is missing; never a failure (P-08). */
  readonly missing: MissingData | null;
}
