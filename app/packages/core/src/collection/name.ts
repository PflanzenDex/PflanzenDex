import type { Species } from "../catalog";

/** The name of the species as the keeper calls it: German, else Latin (assumption; never an invented name, P-08). */
export function speciesDisplayName(species: Pick<Species, "germanName" | "latinName">): string {
  return species.germanName ?? species.latinName;
}

/** Naming rule DM-BES-03: `Species`, with a marker `Species – marker` (en dash with spaces). */
export function specimenName(speciesName: string, marker: string | null): string {
  return marker ? `${speciesName} – ${marker}` : speciesName;
}
