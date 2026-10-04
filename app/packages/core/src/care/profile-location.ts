import type { CareProfileReader, TargetLocationSource } from "../collection";
import type { PhaseLocationSource } from "./phase-location";

/**
 * The real source of the port `PhaseLocationSource` (US-BES-09): the location the keeper selected in their care
 * profile for this phase of the species. Skeleton: the behavior follows the tests.
 */
export function careProfileLocations(profiles: CareProfileReader): PhaseLocationSource {
  void profiles;
  return { phaseLocation: async () => null };
}

/**
 * The real source of the port `TargetLocationSource` (US-BES-02, FR-PHA-05) from the same care profile.
 */
export function careProfileTargetLocation(profiles: CareProfileReader): TargetLocationSource {
  void profiles;
  return { targetLocation: async () => null, growthLocation: async () => null };
}
