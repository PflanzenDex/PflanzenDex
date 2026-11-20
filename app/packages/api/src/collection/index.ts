// Public interface of the `collection` module (ADR 0003): specimen routes.
export { SPECIMEN_PATHS, specimenRoutes } from "./specimens/specimens-routes";
export {
  CARE_PROFILE_PATHS,
  careProfileRoutes,
  careProfileZoneUsageFor,
} from "./care-profile/care-profile-routes";
export { specimenZoneUsageFor } from "./markers/location-routes";
export { collectionReadSourceFor } from "./ai-port/read-source";
export { collectionWriteSourceFor } from "./ai-port/write-source";
