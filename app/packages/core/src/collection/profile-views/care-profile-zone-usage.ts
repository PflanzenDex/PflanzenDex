import type { ZoneUsage, ZoneUser } from "../../light";
import type { CareProfileReader } from "../care-profile/care-profile-types";
import { speciesDisplayName } from "../shared/name";
import type { SpeciesSource } from "../shared/types";

export interface ZoneUsageDependencies {
  readonly profiles: CareProfileReader;
  readonly species: SpeciesSource;
}

/**
 * Port "zone usage" for the zone override of the care profile (US-BES-09): a zone that a profile points to cannot be
 * deleted unnoticed (P-10). Names the species of the profiles of the own account that use the zone (P-04).
 */
export function careProfileZoneUsage(deps: ZoneUsageDependencies): ZoneUsage {
  return {
    user: async (userId, lightZoneId) => {
      const using = (await deps.profiles.list(userId)).filter((p) => p.lightZoneId === lightZoneId);
      const found = await deps.species.findMany(
        userId,
        using.map((p) => p.speciesId),
      );
      return using.flatMap((p, i): ZoneUser[] => {
        const species = found[i];
        return species
          ? [{ kind: "care_profile", id: p.speciesId, name: speciesDisplayName(species) }]
          : [];
      });
    },
  };
}
