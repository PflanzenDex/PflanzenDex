// Public interface of the module `care` (ADR 0003): measurements (US-WAC-01).
export { measurementView } from "./measurements/view";
export type { ViewDependencies } from "./measurements/view";
export { measurementSource } from "./measurements/source";
export type { SourceDependencies } from "./measurements/source";
export { measurementRecord } from "./measurements/record";
export type { RecordDependencies } from "./measurements/record";
export { RATED_BY, MEASUREMENT_LIMITS, QUALITIES } from "./measurements/types";
export type {
  RatedBy,
  MeasurementView,
  MeasurementStore,
  MeasurementValues,
  MeasurementRow,
  Quality,
} from "./measurements/types";
export { CARE_PHASES, monthTag, carePhase, nextPhaseChange } from "./phases/phase";
export type { CarePhase, NextPhaseChange } from "./phases/phase";
export { NO_PHASE_LOCATION } from "./phases/phase-location";
export type { PhaseLocationSource } from "./phases/phase-location";
export { careProfileLocations, careProfileTargetLocation } from "./switching/profile-location";
export { phaseSwitchConfirm, MAX_SWITCH } from "./switching/switch";
export type { SwitchDependencies, SwitchedSpecimen } from "./switching/switch";
export { carePhasesList } from "./phases/phases";
export type { PhasesDependencies, PhasesRow } from "./phases/phases";
export { treatmentPlan } from "./treatments/treatment-plan";
export type { PlanDependencies, PlanResult } from "./treatments/treatment-plan";
export { treatmentComplete } from "./treatments/treatment-complete";
export type { CompleteDependencies, CompleteResult } from "./treatments/treatment-complete";
export { treatmentHistory } from "./treatments/treatment-history";
export type { HistoryDependencies } from "./treatments/treatment-history";
export { treatmentSource } from "./treatments/treatment-source";
export type { TreatmentSourceDependencies } from "./treatments/treatment-source";
export { TREATMENT_LIMITS, COURSE_DEFAULTS } from "./treatment-data/treatment-types";
export type {
  TreatmentRow,
  TreatmentValues,
  TreatmentStore,
} from "./treatment-data/treatment-types";
export { treatmentOpenList, treatmentStatus } from "./treatments/treatment-list";
export type {
  TreatmentListDependencies,
  TreatmentListRow,
  TreatmentStatus,
  TreatmentStatusKind,
} from "./treatments/treatment-list";
export { phaseStatus } from "./phases/phase-status";
export type { PhaseStatus } from "./phases/phase-status";
