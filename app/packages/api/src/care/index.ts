// Public interface of the module `care` (ADR 0003): routes of the measurements.
export {
  measurementPhotoSourceFor,
  measurementSourceFor,
  treatmentSourceFor,
  targetLocationFor,
} from "./source";
export { CARE_PATHS, careRoutes } from "./care-routes";
export { CARE_PHASES_PATHS, carePhasesRoutes } from "./care-phases-routes";
export { TREATMENT_PATHS, treatmentRoutes } from "./treatments-routes";
