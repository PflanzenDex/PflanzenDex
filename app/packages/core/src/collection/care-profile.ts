import { defineOperation, idField, shape } from "../kernel";
import type { SpeciesSource } from "./types";
import type { CareProfileStore } from "./care-profile-types";

export interface CareProfileDependencies {
  readonly profiles: CareProfileStore;
  readonly species: SpeciesSource;
}

const schema = shape({ speciesId: idField("speciesId") });

/**
 * Changes the keeper's own care profile of one species (US-BES-09). Skeleton: the behavior follows the tests.
 */
export const careProfileUpdate = (deps: CareProfileDependencies) =>
  defineOperation({
    name: "care_profile.update",
    schema,
    run: async () => {
      void deps;
      throw new Error("not implemented");
    },
  });
