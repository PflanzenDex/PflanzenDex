// Messungen (US-WAC-01, DM-WAC-01). Ports für Persistenz; Adapter liegen in `db` (AB-1).
import type { Wachstumsmass } from "../katalog";

export const QUALITAETEN = ["gesund", "vergeilt"] as const;
/** `vergeilt` ist „Vergeilt/dünn“ (US-WAC-02); Vergeilung zählt nie als Erfolg (US-WAC-04). */
export type Qualitaet = (typeof QUALITAETEN)[number];

export const BEWERTUNG_DURCH = ["halter", "ki_uebernommen"] as const;
export type BewertungDurch = (typeof BEWERTUNG_DURCH)[number];

/** Grenzen sind Annahmen (Startwerte); die Datenbank prüft dieselben Werte. Der Schritt 0,5 steht in US-WAC-01. */
export const MESSUNG_GRENZEN = {
  wert: { min: 0, max: 10_000 },
  schritt: 0.5,
  notiz: { min: 1, max: 1000 },
} as const;

/** Was gespeichert wird. Rate, Trend und Bewertung des Verlaufs sind abgeleitet und kommen nicht hierher (P-01). */
export interface MessungZeile {
  readonly id: string;
  readonly exemplarId: string;
  /** Lokales Kalenderdatum `JJJJ-MM-TT` (NFR-08). */
  readonly datum: string;
  /** In der Einheit des Wachstumsmaßes der Art (cm). */
  readonly wert: number;
  readonly qualitaet: Qualitaet;
  readonly notiz: string | null;
  readonly bewertungDurch: BewertungDurch;
}

export type MessungWerte = Omit<MessungZeile, "id">;

/** Jeder Aufruf gilt nur für das Konto `nutzerId` (P-04). */
export interface MessungSpeicher {
  /** Alle Messungen des Exemplars, neueste zuerst (Datum, bei gleichem Datum die zuletzt erfasste). */
  liste(nutzerId: string, exemplarId: string): Promise<readonly MessungZeile[]>;
  /** Alles oder nichts; ein Exemplar eines anderen Kontos gilt als unbekannt und schreibt nichts. */
  anlegen(nutzerId: string, werte: MessungWerte): Promise<MessungZeile | "exemplar_unbekannt">;
}

/** Die Ansicht „Messen“ eines Exemplars (US-WAC-01). Rate und Trend folgen mit US-WAC-03. */
export interface MessAnsicht {
  readonly exemplarId: string;
  /** Was gemessen wird: das Wachstumsmaß der Art; `null` heißt „unbekannt“ (P-08). */
  readonly wachstumsmass: Wachstumsmass | null;
  readonly messungen: readonly MessungZeile[];
  readonly letzte: MessungZeile | null;
  /** Qualität der letzten Messung; `null`, solange es keine gibt. */
  readonly letzteBewertung: Qualitaet | null;
}
