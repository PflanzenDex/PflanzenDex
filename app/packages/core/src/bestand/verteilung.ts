// Verteilung der Exemplare auf die Lichtzonen (US-LIC-02, FR-LIC-04): eine reine Ableitung, nie gespeichert (P-01).
// Dieselbe Zählung dient später der Wunschlisten-Priorisierung (Exemplar-Ebene, nur Zonen 2 bis 4).
import { zoneAbleiten, type LichtStandort, type Lichtzone } from "../licht";
import type { Art } from "../katalog";
import { stecklingslicht } from "./steckling";
import { verteilungsHinweis } from "./verteilung-hinweis";
import type { NichtGezaehlt, Verteilung, VerteilungsAbhaengigkeiten } from "./verteilung-typen";
import { istAktiv, type ExemplarZeile } from "./typen";

type Platz = Lichtzone | "stecklingslicht" | "archiviert" | "unbekannt";

interface Kontext {
  readonly zonen: readonly Lichtzone[];
  readonly standorte: readonly LichtStandort[];
  readonly arten: ReadonlyMap<string, Art | null>;
}

/** Zone aus dem Lux-Bedarf der Art (US-LIC-01). „Weiches Blatt“ kennt der Katalog noch nicht, es wird nie angenommen. */
function zoneDerArt(art: Art | null | undefined, zonen: readonly Lichtzone[]): Platz {
  if (!art) return "unbekannt";
  const a = zoneAbleiten(
    { lichtbedarfLux: art.lichtbedarfLux, standardStufe: art.standardStufe, weichesBlatt: false },
    zonen,
  );
  return a.art === "zone" ? a.zone : "unbekannt";
}

/**
 * Wohin ein Exemplar zählt (FR-LIC-02): Steckling und Archiv zuerst (`istAktiv`, dieselbe Regel wie in Liste und Karten, US-BES-07), dann die Zone seines Standorts (Exemplar vor
 * Art), sonst die abgeleitete Zone der Art. Die niedrigste Zone des Kontos ist das Stecklingslicht.
 */
function platzVon(z: ExemplarZeile, k: Kontext): Platz {
  if (!istAktiv(z)) return "archiviert";
  if (z.status === "steckling") return "stecklingslicht";
  const standort = k.standorte.find((s) => s.id === z.standortId);
  const eigene = k.zonen.find((l) => l.id === standort?.lichtzoneId);
  if (!eigene) return zoneDerArt(k.arten.get(z.artId), k.zonen);
  return eigene.id === stecklingslicht(k.zonen)?.id ? "stecklingslicht" : eigene;
}

const duennsteZonen = (zonen: readonly { zone: Lichtzone; anzahl: number }[]): Lichtzone[] => {
  const gezaehlt = zonen.reduce((summe, z) => summe + z.anzahl, 0);
  if (gezaehlt === 0) return [];
  const kleinste = Math.min(...zonen.map((z) => z.anzahl));
  return zonen.filter((z) => z.anzahl === kleinste).map((z) => z.zone);
};

/**
 * Verteilung der Exemplare des Kontos auf die Zonen 2 bis 4. Nur die Daten des Kontos fließen ein (P-04). Was nicht
 * gezählt wird (Stecklingslicht, archiviert, Zone unbekannt), steht in `nichtGezaehlt`.
 */
export async function zonenVerteilung(
  deps: VerteilungsAbhaengigkeiten,
  nutzerId: string,
): Promise<Verteilung> {
  const [zeilen, standorte, alleZonen] = await Promise.all([
    deps.exemplare.liste(nutzerId),
    deps.standorte.liste(nutzerId),
    deps.zonen.liste(nutzerId),
  ]);
  const zonen = [...alleZonen].sort((a, b) => a.reihenfolge - b.reihenfolge);
  const artIds = [...new Set(zeilen.map((z) => z.artId))];
  const gelesen = await Promise.all(artIds.map((id) => deps.arten.finde(nutzerId, id)));
  const kontext: Kontext = {
    zonen,
    standorte,
    arten: new Map(artIds.map((id, i) => [id, gelesen[i] ?? null] as const)),
  };
  const anzahl = new Map<string, number>();
  const rest = { stecklingslicht: 0, archiviert: 0, zoneUnbekannt: 0 };
  for (const z of zeilen) {
    const platz = platzVon(z, kontext);
    if (platz === "stecklingslicht") rest.stecklingslicht += 1;
    else if (platz === "archiviert") rest.archiviert += 1;
    else if (platz === "unbekannt") rest.zoneUnbekannt += 1;
    else anzahl.set(platz.id, (anzahl.get(platz.id) ?? 0) + 1);
  }
  const gezaehlt = zonen.slice(1).map((zone) => ({ zone, anzahl: anzahl.get(zone.id) ?? 0 }));
  const duennste = duennsteZonen(gezaehlt);
  const nichtGezaehlt: NichtGezaehlt = rest;
  return {
    zonen: gezaehlt,
    duennste,
    nichtGezaehlt,
    hinweis: verteilungsHinweis(gezaehlt, duennste),
  };
}
