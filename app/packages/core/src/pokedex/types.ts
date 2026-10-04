// Pokédex ownership (US-POK-06): derived live from the specimens, never stored (P-01).
import type { SpeciesSource, SpecimenStore } from "../collection";

/** Species key of a Latin name: `species` is `null` as long as the epithet is missing. */
export interface SpeciesKey {
  readonly species: string | null;
  readonly genus: string | null;
  readonly epithet: string | null;
  /** Addition shown as a chip on the card (`var. albispina`, `'Cultivar'`); `null` without one. */
  readonly chip: string | null;
}

export interface CaughtSpecies {
  readonly species: string;
  readonly genus: string;
  readonly chips: readonly string[];
  readonly specimenCount: number;
}

/** An active specimen that does not count as caught yet, with what fixes it (P-09, P-10). */
export interface UnidentifiedSpecimen {
  readonly specimenId: string;
  readonly specimenName: string;
  /** `null` if the account cannot read the species of the specimen. */
  readonly latinName: string | null;
  readonly text: string;
  readonly nextAction: string;
}

export interface Ownership {
  readonly caught: readonly CaughtSpecies[];
  readonly unidentified: readonly UnidentifiedSpecimen[];
}

/** Reading ports; every call applies to the account only (P-04). */
export interface OwnershipDependencies {
  readonly specimens: Pick<SpecimenStore, "list">;
  readonly species: SpeciesSource;
}
