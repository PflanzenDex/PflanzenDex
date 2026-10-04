// Public interface of the module `care` (ADR 0003): measurements (US-WAC-01).
export { measurementView } from "./view";
export type { ViewDependencies } from "./view";
export { measurementSource } from "./source";
export type { SourceDependencies } from "./source";
export { measurementRecord } from "./record";
export type { RecordDependencies } from "./record";
export { RATED_BY, MEASUREMENT_LIMITS, QUALITIES } from "./types";
export type {
  RatedBy,
  MeasurementView,
  MeasurementStore,
  MeasurementValues,
  MeasurementRow,
  Quality,
} from "./types";
export { CARE_PHASES, monthTag, carePhase } from "./phase";
export type { CarePhase } from "./phase";
export { NO_PHASE_LOCATION } from "./phase-location";
export type { PhaseLocationSource } from "./phase-location";
export { careProfileLocations, careProfileTargetLocation } from "./profile-location";
export { phaseSwitchConfirm, MAX_SWITCH } from "./switch";
export type { SwitchDependencies, SwitchedSpecimen } from "./switch";
export { carePhasesList } from "./phases";
export type { PhasesDependencies, PhasesRow } from "./phases";
export { treatmentPlan } from "./treatment-plan";
export type { PlanDependencies, PlanResult } from "./treatment-plan";
export { treatmentSource } from "./treatment-source";
export type { TreatmentSourceDependencies } from "./treatment-source";
export { TREATMENT_LIMITS, COURSE_DEFAULTS } from "./treatment-types";
export type { TreatmentRow, TreatmentValues, TreatmentStore } from "./treatment-types";
export { phaseStatus } from "./phase-status";
export type { PhaseStatus } from "./phase-status";
