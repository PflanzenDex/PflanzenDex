// Exemplar-Karten (US-BES-06): was die Karte zeigt und welche Daten sie von anderen Modulen braucht (Ports).
import type { ExemplarStatus } from "./typen";

export const MESS_QUALITAETEN = ["gesund", "vergeilt"] as const;
export type MessQualitaet = (typeof MESS_QUALITAETEN)[number];

export interface LetzteMessung {
  /** Lokales Kalenderdatum `JJJJ-MM-TT` (NFR-08). */
  readonly datum: string;
  readonly qualitaet: MessQualitaet;
  readonly notiz: string | null;
}

export interface MessungsAnsicht {
  readonly letzte: LetzteMessung;
  /** Foto der jüngsten Messung, die eines hat; das kann eine ältere sein als die letzte Messung. */
  readonly foto: { readonly url: string; readonly datum: string } | null;
}

/**
 * Port „Messungen je Exemplar“ (US-BES-06): `pflege` (WAC) setzt ihn um. Er nennt je Exemplar die letzte Messung und
 * das jüngste Foto; ein Exemplar ohne Messung fehlt in der Antwort. Nur Exemplare des Kontos `nutzerId` werden erfragt.
 */
export interface MessungsQuelle {
  fuer(
    nutzerId: string,
    exemplarIds: readonly string[],
  ): Promise<ReadonlyMap<string, MessungsAnsicht>>;
}

export interface OffeneBehandlung {
  readonly id: string;
  readonly grund: string;
  /** Lokales Kalenderdatum `JJJJ-MM-TT`. */
  readonly faelligAm: string;
}

/** Port „Offene Behandlungen je Exemplar“ (US-BES-06): `pflege` (BEH) setzt ihn um; ohne offene Behandlung fehlt der Eintrag. */
export interface BehandlungsQuelle {
  offene(
    nutzerId: string,
    exemplarIds: readonly string[],
  ): Promise<ReadonlyMap<string, readonly OffeneBehandlung[]>>;
}

export interface Faelligkeit {
  readonly art: "ueberfaellig" | "heute" | "bald";
  /** Betrag in Kalendertagen (0 bei „heute“). */
  readonly tage: number;
  readonly text: string;
}

export interface ExemplarKarte {
  readonly id: string;
  readonly name: string;
  /** Name der Art, `null` heißt „unbekannt“ (P-08): die Art ist für dieses Konto nicht (mehr) sichtbar. */
  readonly artName: string | null;
  readonly status: ExemplarStatus;
  readonly standort: string | null;
  /** Zone des Standorts (ein Override am Exemplar gibt es erst mit BES-04); `null` = unbekannt. */
  readonly lichtzone: string | null;
  readonly gefangenAm: string | null;
  readonly foto: MessungsAnsicht["foto"];
  /** `null` = noch keine Messung. */
  readonly letzteMessung: LetzteMessung | null;
  /** Die am frühesten fällige offene Behandlung, `null` ohne offene Behandlung. */
  readonly behandlung: { readonly grund: string; readonly faelligkeit: Faelligkeit } | null;
  readonly weitereBehandlungen: number;
}
