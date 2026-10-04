import type { ZoneUsage } from "../light";
import type { CareProfileReader } from "./care-profile-types";
import type { SpeciesSource } from "./types";

export interface ZoneUsageDependencies {
  readonly profiles: CareProfileReader;
  readonly species: SpeciesSource;
}

/**
 * Port "zone usage" for the zone override of the care profile (US-BES-09): a zone that a profile points to cannot be
 * deleted unnoticed. Skeleton: the behavior follows the tests.
 */
export function careProfileZoneUsage(deps: ZoneUsageDependencies): ZoneUsage {
  void deps;
  return { user: async () => [] };
}
