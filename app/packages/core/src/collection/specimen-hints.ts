// Hints about incomplete specimens (US-BES-08): a stub so that the tests compile and fail first (P-06).
import type { LightLocationStore } from "../light";
import type { SpeciesSource, SpecimenStore } from "./types";

export interface SpecimenHint {
  readonly kind: "species_missing" | "location_missing" | "location_without_zone";
  readonly specimenId: string;
  readonly specimenName: string;
  readonly locationId: string | null;
  readonly text: string;
  readonly nextAction: string;
}

export interface HintsDependencies {
  readonly specimens: Pick<SpecimenStore, "list">;
  readonly species: SpeciesSource;
  readonly locations: LightLocationStore;
}

export async function specimenHints(
  deps: HintsDependencies,
  userId: string,
): Promise<readonly SpecimenHint[]> {
  void deps;
  void userId;
  return [];
}
