import type { Species } from "../../catalog";

/** The name of the species as the keeper calls it: German, else Latin (assumption; never an invented name, P-08). */
export function speciesDisplayName(species: Pick<Species, "germanName" | "latinName">): string {
  return species.germanName ?? species.latinName;
}

/**
 * The name a species is shown and sorted by (US-QS-32, F-0119): the German name where the species has one that is not the
 * scientific name itself, else the scientific name. An empty German name is none (P-08).
 */
export function shownSpeciesName(scientific: string, german: string | null): string {
  return german && german !== scientific ? german : scientific;
}

/** Naming rule DM-BES-03: `Species`, with a marker `Species – marker` (en dash with spaces). */
export function specimenName(speciesName: string, marker: string | null): string {
  return marker ? `${speciesName} – ${marker}` : speciesName;
}
