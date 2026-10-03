import {
  definiereOperation,
  fehler,
  fehlgeschlagen,
  heuteLokal,
  kennungFeld,
  objekt,
  ok,
  oderNull,
  textFeld,
  wahlFeld,
  zeitzoneFeld,
} from "../kern";
import type { ExemplarSpeicher } from "../bestand";
import { datumFeld, rasterFeld } from "./felder";
import { MESSUNG_GRENZEN, QUALITAETEN } from "./typen";
import type { MessungSpeicher } from "./typen";

export interface ErfassenAbhaengigkeiten {
  readonly messungen: MessungSpeicher;
  readonly exemplare: Pick<ExemplarSpeicher, "finde">;
  /** Die Uhr kommt von außen, damit „heute“ prüfbar ist (NFR-08). */
  readonly uhr: () => Date;
}

// Die Zeitzone schickt vorerst das Gerät mit (das Profil kennt noch keine, US-ACC-02); sie bestimmt „heute“.
const schema = objekt({
  exemplarId: kennungFeld("exemplarId"),
  zeitzone: zeitzoneFeld("zeitzone"),
  datum: oderNull(datumFeld("datum")),
  wert: rasterFeld("wert", MESSUNG_GRENZEN.wert, MESSUNG_GRENZEN.schritt),
  qualitaet: oderNull(wahlFeld("qualitaet", QUALITAETEN)),
  notiz: oderNull(textFeld("notiz", MESSUNG_GRENZEN.notiz)),
});

const zukunft = fehlgeschlagen(
  fehler("eingabe.ungueltig", { details: [{ feld: "datum", code: "eingabe.ungueltig" }] }),
);

/**
 * Erfasst eine Messung (US-WAC-01). Das Datum ist standardmäßig heute in der Zeitzone des Nutzers und änderbar
 * (Nachtragen); ein Datum in der Zukunft wird abgelehnt (Annahme: ein Tippfehler im Jahr würde jede spätere Rate
 * verfälschen). Die Qualität ist ohne Angabe `gesund` (US-WAC-02). Ein fremdes oder unbekanntes Exemplar sieht gleich
 * aus: `exemplar.nicht_gefunden`, nichts wird geschrieben (P-04). Das Foto fehlt noch (Medienverarbeitung, FR-WAC-09).
 */
export const messungErfassen = (deps: ErfassenAbhaengigkeiten) =>
  definiereOperation({
    name: "messung.erfassen",
    schema,
    ausfuehren: async ({ nutzerId }, eingabe) => {
      const exemplar = await deps.exemplare.finde(nutzerId, eingabe.exemplarId);
      if (!exemplar) return fehlgeschlagen(fehler("exemplar.nicht_gefunden"));
      if (exemplar.status === "archiviert") return fehlgeschlagen(fehler("exemplar.archiviert"));
      const heute = heuteLokal(deps.uhr(), eingabe.zeitzone);
      const datum = eingabe.datum ?? heute;
      if (datum > heute) return zukunft;
      const r = await deps.messungen.anlegen(nutzerId, {
        exemplarId: exemplar.id,
        datum,
        wert: eingabe.wert,
        qualitaet: eingabe.qualitaet ?? "gesund",
        notiz: eingabe.notiz,
        bewertungDurch: "halter",
      });
      return r === "exemplar_unbekannt" ? fehlgeschlagen(fehler("exemplar.nicht_gefunden")) : ok(r);
    },
  });
