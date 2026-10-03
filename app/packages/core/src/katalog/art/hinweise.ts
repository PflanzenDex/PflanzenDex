import type { Art } from "./typen";

export interface ArtHinweis {
  readonly text: string;
  /** P-09: jede Ansicht sagt, was als Nächstes zu tun ist. */
  readonly naechsteHandlung: string;
}

/** Hinweise zu Status und Pokédex-Wirkung einer Art (FR-BES-11, US-POK-06). Leer, wenn nichts zu sagen ist. */
export function artHinweise(art: Art): readonly ArtHinweis[] {
  const hinweise: ArtHinweis[] = [];
  if (art.pruefstatus === "vorschlag" || art.pruefstatus === "ki_ungeprueft") {
    hinweise.push({
      text: "Dieses Profil ist ein Vorschlag, nur für dich sichtbar, und zählt noch nicht im Pokédex.",
      naechsteHandlung: "Art prüfen lassen, dann zählt sie.",
    });
  }
  if (art.pruefstatus === "zurueckgewiesen") {
    hinweise.push({
      text: "Die Prüfung hat dieses Profil nicht freigegeben. Es bleibt nur für dich sichtbar.",
      naechsteHandlung: "Schlage die Art mit korrigierten Angaben erneut vor.",
    });
  }
  if (art.epitheton === null) {
    hinweise.push({
      text: "Nur die Gattung ist angegeben. Ein solcher Eintrag zählt nicht als Pokédex-Fang.",
      naechsteHandlung: "Kennst du die genaue Art, schlage sie mit Epitheton vor.",
    });
  }
  return hinweise;
}
