import { appError, defineOperation, failed, ok } from "../../kernel";
import { careProfileSchema } from "./care-profile-schema";
import type { CareProfileStore } from "./care-profile-types";
import type { SpeciesSource } from "../shared/types";

export interface CareProfileDependencies {
  readonly profiles: CareProfileStore;
  readonly species: SpeciesSource;
}

const STORE_ERROR = {
  location_unknown: "location.not_found",
  zone_unknown: "light_zone.not_found",
  species_unknown: "species.not_found",
} as const;

/**
 * Changes the keeper's own care profile of one species (US-BES-09, DM-BES-04). The species must be visible to the
 * account; locations and zone must be the account's own (selected by ID, never typed, FR-PHA-03). Only the profile is
 * written, never the catalog. Setting the same values again changes nothing, so a repeat is harmless (US-QS-03).
 */
export const careProfileUpdate = (deps: CareProfileDependencies) =>
  defineOperation({
    name: "care_profile.update",
    schema: careProfileSchema,
    run: async ({ userId }, input) => {
      if (!(await deps.species.find(userId, input.speciesId)))
        return failed(appError("species.not_found"));
      const r = await deps.profiles.update(userId, input.speciesId, input.changes);
      return typeof r === "string" ? failed(appError(STORE_ERROR[r])) : ok(r);
    },
  });
