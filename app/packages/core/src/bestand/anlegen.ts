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
  zeitzoneFeld,
} from "../kern";
import { mitAbleitungen } from "./lesen";
import { artAnzeigename, exemplarName } from "./name";
import { EXEMPLAR_GRENZEN } from "./typen";
import type { ArtQuelle, ExemplarSpeicher, SollStandortQuelle } from "./typen";

export interface AnlegenAbhaengigkeiten {
  readonly exemplare: ExemplarSpeicher;
  readonly arten: ArtQuelle;
  readonly sollStandort: SollStandortQuelle;
  /** Die Uhr kommt von außen, damit „heute“ prüfbar ist (NFR-08). */
  readonly uhr: () => Date;
}

// Die Zeitzone schickt vorerst das Gerät mit (das Profil kennt noch keine, US-ACC-02); sie bestimmt „heute“.
const schema = objekt({
  artId: kennungFeld("artId"),
  zeitzone: zeitzoneFeld("zeitzone"),
  kennzeichen: oderNull(textFeld("kennzeichen", EXEMPLAR_GRENZEN.kennzeichen)),
  standortId: oderNull(kennungFeld("standortId")),
});

/**
 * Legt ein Exemplar an (US-BES-02): Pflicht ist die Art. Der Name steht vor dem Speichern fest (DM-BES-03); ist er
 * vergeben, wird nichts geschrieben und der Fehler nennt die vorhandenen Exemplare der Art (FR-BES-03, P-10).
 * `Gefangen_Am` ist das heutige Datum in der Zeitzone des Nutzers (FR-BES-04). Der Standort ist der gewählte, sonst
 * der Soll-Standort aus dem Port, sonst unbekannt (P-08).
 */
export const exemplarAnlegen = (deps: AnlegenAbhaengigkeiten) =>
  definiereOperation({
    name: "exemplar.anlegen",
    schema,
    ausfuehren: async ({ nutzerId }, eingabe) => {
      const art = await deps.arten.finde(nutzerId, eingabe.artId);
      if (!art) return fehlgeschlagen(fehler("art.nicht_gefunden"));
      const heute = heuteLokal(deps.uhr(), eingabe.zeitzone);
      const name = exemplarName(artAnzeigename(art), eingabe.kennzeichen);
      const standortId =
        eingabe.standortId ?? (await deps.sollStandort.sollStandort(nutzerId, art, heute));
      const r = await deps.exemplare.anlegen(nutzerId, {
        artId: art.id,
        name,
        kennzeichen: eingabe.kennzeichen,
        standortId,
        gefangenAm: heute,
      });
      if (r === "standort_unbekannt") return fehlgeschlagen(fehler("standort.nicht_gefunden"));
      if (r !== "name_vergeben") return ok(mitAbleitungen(r));
      const vorhandene = (await deps.exemplare.liste(nutzerId))
        .filter((z) => z.artId === art.id)
        .map(({ id, name: n }) => ({ id, name: n }));
      return fehlgeschlagen(fehler("exemplar.name_vergeben", { daten: { name, vorhandene } }));
    },
  });
