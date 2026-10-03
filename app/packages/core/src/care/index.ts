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
export { carePhasesList } from "./phases";
export type { PhasesDependencies, PhasesRow } from "./phases";
