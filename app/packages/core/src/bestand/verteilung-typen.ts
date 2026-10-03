// Verteilung der Exemplare auf die Lichtzonen (US-LIC-02, FR-LIC-04): Formen der abgeleiteten Ansicht.
import type { LichtStandortSpeicher, Lichtzone, ZonenSpeicher } from "../licht";
import type { ArtQuelle, ExemplarSpeicher } from "./typen";

export interface ZonenZaehlung {
  readonly zone: Lichtzone;
  readonly anzahl: number;
}

/** Was nicht in die Zählung eingeht, wird trotzdem genannt (P-10); Zonen, die nicht ableitbar sind, heißen „unbekannt“ (P-08). */
export interface NichtGezaehlt {
  readonly stecklingslicht: number;
  readonly archiviert: number;
  readonly zoneUnbekannt: number;
}

export interface VerteilungsHinweis {
  readonly text: string;
  readonly naechsteHandlung: string;
}

export interface Verteilung {
  /** Die Zonen 2 bis 4 (alle außer Stecklingslicht) in der Reihenfolge des Kontos, auch mit Anzahl 0. */
  readonly zonen: readonly ZonenZaehlung[];
  /** Alle Zonen mit der kleinsten Anzahl (bei Gleichstand mehrere); leer, solange nichts gezählt ist. */
  readonly duennste: readonly Lichtzone[];
  readonly nichtGezaehlt: NichtGezaehlt;
  readonly hinweis: VerteilungsHinweis;
}

/** Lesende Ports; jeder Aufruf gilt nur für das Konto (P-04). */
export interface VerteilungsAbhaengigkeiten {
  readonly exemplare: ExemplarSpeicher;
  readonly arten: ArtQuelle;
  readonly standorte: LichtStandortSpeicher;
  readonly zonen: ZonenSpeicher;
}
