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

/**
 * Catch date of a species (US-POK-07): `caught_at` is the date the keeper gave, `created_at` the local date the first
 * specimen was created (shown as "≈"), `unknown` has no date. Never guessed (P-08).
 */
export interface CatchDate {
  /** Local calendar date `YYYY-MM-DD` (NFR-08); `null` exactly when `source` is `unknown`. */
  readonly date: string | null;
  readonly source: "caught_at" | "created_at" | "unknown";
}

export interface CaughtSpecies {
  readonly species: string;
  readonly genus: string;
  readonly chips: readonly string[];
  readonly specimenCount: number;
  /** Earliest date across all active and archived specimens of the species (US-POK-07). */
  readonly caughtDate: CatchDate;
  /** German name of the species (US-POK-08 search); `null` means "unknown" (P-08). */
  readonly germanName: string | null;
  /** Family of the species (US-POK-08 search and grouping); `null` means "unknown" (P-08). */
  readonly familyLatin: string | null;
  readonly familyGerman: string | null;
  /**
   * Species count of the genus (GBIF, US-POK-03). Always `null` until the taxonomy build exists: no number is
   * invented (P-08).
   */
  readonly genusSpeciesCount: number | null;
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
