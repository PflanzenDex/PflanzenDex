import type { Species } from "./types";

export interface SpeciesHint {
  readonly text: string;
  /** P-09: every view says what to do next. */
  readonly nextAction: string;
}

/** Linear scan (no regular expression, the text is typed by a reviewer): cuts trailing `.`, `!`, `?` and whitespace. */
function withoutTrailingPunctuation(text: string): string {
  let end = text.length;
  while (end > 0 && ".!? \t\n\r".includes(text.charAt(end - 1))) end -= 1;
  return text.slice(0, end);
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
      text: `Die Prüfung hat dieses Profil nicht freigegeben${
        species.reviewReason ? `: ${withoutTrailingPunctuation(species.reviewReason)}` : ""
      }. Es bleibt nur für dich sichtbar.`,
      nextAction: "Schlage die Art mit korrigierten Angaben erneut vor.",
    });
  }
  if (species.reviewStatus === "reviewed" && species.own) {
    hints.push({
      text: "Deine Art wurde geprüft und freigegeben. Sie ist jetzt für alle sichtbar und zählt im Pokédex.",
      nextAction: "Schau im Pokédex nach, was sich für dich geändert hat.",
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
