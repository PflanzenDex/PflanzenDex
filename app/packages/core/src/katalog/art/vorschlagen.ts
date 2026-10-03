import { definiereOperation, fehler, fehlgeschlagen, ok } from "../../kern";
import { artSchema, type ArtEingabe } from "./felder";
import { normalisiere } from "./name";
import type { ArtName, ArtSpeicher, ArtWerte, NamensFeld } from "./typen";

function werteAus(e: ArtEingabe): ArtWerte {
  const { lateinischerName: name, ...rest } = e;
  return {
    ...rest,
    lateinischerName: name.anzeige,
    gattung: name.gattung,
    epitheton: name.epitheton,
    sorte: name.sorte,
  };
}

/** Alle Namen der Art mit Schlüssel; doppelte Schlüssel (z. B. ein Synonym gleich dem Namen) zählen einmal. */
export function namenAus(w: ArtWerte): ArtName[] {
  const roh: [NamensFeld, string | null][] = [
    ["lateinisch", w.lateinischerName],
    ["deutsch", w.deutscherName],
    ["englisch", w.englischerName],
    ...w.synonyme.map((s): [NamensFeld, string] => ["synonym", s]),
  ];
  const alle = roh.flatMap(([feld, anzeige]): ArtName[] =>
    anzeige ? [{ feld, anzeige, norm: normalisiere(anzeige) }] : [],
  );
  const gesehen = new Set<string>();
  return alle.filter((n) => {
    const schluessel = `${n.feld === "synonym" ? "lateinisch" : n.feld}:${n.norm}`;
    const neu = n.norm !== "" && !gesehen.has(schluessel);
    gesehen.add(schluessel);
    return neu;
  });
}

/**
 * Legt eine Art als Vorschlag an: Prüfstatus `vorschlag`, nur für den Ersteller sichtbar, Eintrag in der Prüfliste
 * (FR-BES-11, US-BES-10). Das ist der manuelle Weg ohne KI (FR-KI-05). Ist die Art (oder ein Synonym) schon
 * sichtbar vorhanden, wird nichts angelegt, sondern auf die vorhandene Art verwiesen (FR-BES-03).
 */
export const artVorschlagen = (speicher: ArtSpeicher) =>
  definiereOperation({
    name: "art.vorschlagen",
    schema: artSchema,
    ausfuehren: async (kontext, eingabe) => {
      const werte = werteAus(eingabe);
      const r = await speicher.anlegen(kontext.nutzerId, werte, namenAus(werte));
      return r.art === "neu"
        ? ok(r.wert)
        : fehlgeschlagen(fehler("art.dublette", { daten: { vorhandene: r.wert } }));
    },
  });
