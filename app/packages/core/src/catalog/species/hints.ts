import type { Species } from "./types";

export interface SpeciesHint {
  readonly text: string;
  /** P-09: every view says what to do next. */
  readonly nextAction: string;
}

/** Hints on the status and Pokédex effect of a species (FR-BES-11, US-POK-06). Empty if there is nothing to say. */
export function speciesHints(species: Species): readonly SpeciesHint[] {
  const hints: SpeciesHint[] = [];
  if (species.reviewStatus === "proposal" || species.reviewStatus === "ai_unreviewed") {
    hints.push({
      text: "Dieses Profil ist ein Vorschlag, nur für dich sichtbar, und zählt noch nicht im Pokédex.",
      nextAction: "Art prüfen lassen, dann zählt sie.",
    });
  }
  if (species.reviewStatus === "rejected") {
    hints.push({
      text: "Die Prüfung hat dieses Profil nicht freigegeben. Es bleibt nur für dich sichtbar.",
      nextAction: "Schlage die Art mit korrigierten Angaben erneut vor.",
    });
  }
  if (species.epithet === null) {
    hints.push({
      text: "Nur die Gattung ist angegeben. Ein solcher Eintrag zählt nicht als Pokédex-Fang.",
      nextAction: "Kennst du die genaue Art, schlage sie mit Epitheton vor.",
    });
  }
  return hints;
}
