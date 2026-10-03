// Exemplare (US-BES-02, DM-BES-02). Ports für Persistenz und Soll-Standort; Adapter liegen in `db` bzw. in `pflege` (AB-1).
import type { Art } from "../katalog";

export const EXEMPLAR_STATUS = ["pflanze", "steckling", "archiviert"] as const;
export type ExemplarStatus = (typeof EXEMPLAR_STATUS)[number];

/** Grenzen sind Annahmen (Startwerte); die Datenbank prüft dieselben Werte. */
export const EXEMPLAR_GRENZEN = {
  kennzeichen: { min: 1, max: 40 },
  name: { min: 1, max: 250 },
} as const;

/** Was gespeichert wird. Messreihe und Behandlungsliste sind abgeleitet und kommen nicht hierher (P-01). */
export interface ExemplarZeile {
  readonly id: string;
  readonly artId: string;
  readonly name: string;
  readonly kennzeichen: string | null;
  /** `null` heißt „unbekannt“ (P-08): kein Soll-Standort bekannt und keiner gewählt. */
  readonly standortId: string | null;
  readonly status: ExemplarStatus;
  /** Lokales Kalenderdatum `JJJJ-MM-TT` (NFR-08). */
  readonly gefangenAm: string | null;
}

/** Ein Exemplar mit den abgeleiteten Listen. Beide sind leer, bis WAC und BEH Daten liefern (nie gespeichert). */
export interface Exemplar extends ExemplarZeile {
  readonly messreihe: readonly never[];
  readonly behandlungen: readonly never[];
}

export type ExemplarWerte = Pick<
  ExemplarZeile,
  "artId" | "name" | "kennzeichen" | "standortId" | "gefangenAm"
>;

/** Jeder Aufruf gilt nur für das Konto `nutzerId` (P-04). Der Name ist je Konto eindeutig (ohne Schreibweise). */
export interface ExemplarSpeicher {
  liste(nutzerId: string): Promise<readonly ExemplarZeile[]>;
  finde(nutzerId: string, id: string): Promise<ExemplarZeile | null>;
  /** Alles oder nichts; bei vergebenem Namen oder fremdem Standort wird nichts geschrieben (FR-BES-03). */
  anlegen(
    nutzerId: string,
    werte: ExemplarWerte,
  ): Promise<ExemplarZeile | "name_vergeben" | "standort_unbekannt">;
}

/** Nur das Lesen einer sichtbaren Art; `ArtSpeicher` aus `katalog` erfüllt den Port. */
export interface ArtQuelle {
  finde(nutzerId: string, id: string): Promise<Art | null>;
}

/**
 * Port „Soll-Standort“ (US-BES-02, FR-PHA-05): die Kennung des Standorts, an den ein neues Exemplar dieser Art
 * heute gehört (Wachstumsphase, in der Ruhephase der Ruhestandort, falls es einen gibt), oder `null` für „unbekannt“.
 * `heute` ist das lokale Datum des Nutzers. Das untere Modul `bestand` definiert den Port, `pflege` (PHA) setzt ihn um.
 */
export interface SollStandortQuelle {
  sollStandort(nutzerId: string, art: Art, heute: string): Promise<string | null>;
}
