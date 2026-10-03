// Exemplar-Karten (US-BES-06): eine reine Ableitung aus Exemplaren, Standorten, Zonen und den Ports für Messungen und
// Behandlungen (P-01: berechnet, nie gespeichert). Was fehlt, bleibt `null` und heißt „unbekannt“ (P-08).
import type { LichtStandortSpeicher, ZonenSpeicher } from "../licht";
import type {
  BehandlungsQuelle,
  ExemplarKarte,
  Faelligkeit,
  MessungsAnsicht,
  MessungsQuelle,
  OffeneBehandlung,
} from "./karten-typen";
import { artAnzeigename } from "./name";
import type { ArtQuelle, ExemplarSpeicher, ExemplarZeile } from "./typen";

export interface KartenAbhaengigkeiten {
  readonly exemplare: ExemplarSpeicher;
  readonly arten: ArtQuelle;
  readonly standorte: LichtStandortSpeicher;
  readonly zonen: ZonenSpeicher;
  readonly messungen: MessungsQuelle;
  readonly behandlungen: BehandlungsQuelle;
}

/** Bis WAC und BEH ihre Daten liefern, gibt es keine Messungen und keine Behandlungen (nichts wird erfunden). */
export const KEINE_MESSUNGEN: MessungsQuelle = { fuer: async () => new Map() };
export const KEINE_BEHANDLUNGEN: BehandlungsQuelle = { offene: async () => new Map() };

const TAG_MS = 86_400_000;
const tagesnummer = (datum: string): number => {
  const [j, m, t] = datum.split("-").map(Number);
  return Date.UTC(j ?? 0, (m ?? 1) - 1, t ?? 1) / TAG_MS;
};

/**
 * Fälligkeit einer Behandlung als Kalendertage zwischen zwei lokalen Daten `JJJJ-MM-TT` (NFR-08): überfällig seit
 * N Tg., heute fällig, in N Tg. Die Rechnung kennt keine Uhrzeit und keine Zeitzone.
 */
export function faelligkeit(faelligAm: string, heute: string): Faelligkeit {
  const diff = tagesnummer(faelligAm) - tagesnummer(heute);
  if (diff < 0) {
    return { art: "ueberfaellig", tage: -diff, text: `überfällig seit ${-diff} Tg.` };
  }
  if (diff === 0) return { art: "heute", tage: 0, text: "heute fällig" };
  return { art: "bald", tage: diff, text: `in ${diff} Tg.` };
}

const nachFaelligkeit = (a: OffeneBehandlung, b: OffeneBehandlung) =>
  a.faelligAm.localeCompare(b.faelligAm) || a.id.localeCompare(b.id);

function behandlungsAnzeige(offene: readonly OffeneBehandlung[], heute: string) {
  const [erste, ...weitere] = [...offene].sort(nachFaelligkeit);
  return {
    behandlung: erste
      ? { grund: erste.grund, faelligkeit: faelligkeit(erste.faelligAm, heute) }
      : null,
    weitereBehandlungen: weitere.length,
  };
}

function messungsAnzeige(messung: MessungsAnsicht | undefined) {
  return { foto: messung?.foto ?? null, letzteMessung: messung?.letzte ?? null };
}

/**
 * Die Karten aller Exemplare des Kontos (US-BES-06). Die Ports für Messungen und Behandlungen werden einmal für alle
 * eigenen Exemplare gefragt, nie für fremde (P-04). `heute` ist das lokale Datum des Nutzers.
 */
export async function exemplarKarten(
  deps: KartenAbhaengigkeiten,
  nutzerId: string,
  heute: string,
): Promise<readonly ExemplarKarte[]> {
  const zeilen = await deps.exemplare.liste(nutzerId);
  const ids = zeilen.map((z) => z.id);
  const artIds = [...new Set(zeilen.map((z) => z.artId))];
  const [standorte, zonen, arten, messungen, behandlungen] = await Promise.all([
    deps.standorte.liste(nutzerId),
    deps.zonen.liste(nutzerId),
    Promise.all(artIds.map((id) => deps.arten.finde(nutzerId, id))),
    deps.messungen.fuer(nutzerId, ids),
    deps.behandlungen.offene(nutzerId, ids),
  ]);
  const artNamen = new Map(
    artIds.map((id, i) => [id, arten[i] ? artAnzeigename(arten[i]) : null] as const),
  );
  const karte = (z: ExemplarZeile): ExemplarKarte => {
    const standort = standorte.find((s) => s.id === z.standortId);
    return {
      id: z.id,
      name: z.name,
      artName: artNamen.get(z.artId) ?? null,
      status: z.status,
      standort: standort?.name ?? null,
      lichtzone: zonen.find((l) => l.id === standort?.lichtzoneId)?.name ?? null,
      gefangenAm: z.gefangenAm,
      ...messungsAnzeige(messungen.get(z.id)),
      ...behandlungsAnzeige(behandlungen.get(z.id) ?? [], heute),
    };
  };
  return zeilen.map(karte);
}
