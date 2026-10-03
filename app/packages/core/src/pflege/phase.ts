// Pflegephase eines Exemplars (US-PHA-01, FR-PHA-01). Reine Funktionen: die Phase wird bei jeder Abfrage aus dem
// Kalender abgeleitet und nie gespeichert (P-01).

export const PFLEGEPHASEN = ["wachstum", "ruhe"] as const;
export type Pflegephase = (typeof PFLEGEPHASEN)[number];

/** Monat-Tag `MM-TT` eines lokalen Kalenderdatums `JJJJ-MM-TT` (NFR-08). */
export const monatTag = (datum: string): string => datum.slice(5, 10);

/**
 * Ruhephase, wenn `heute` im Zeitraum `von` bis `bis` liegt (beide Tage eingeschlossen), sonst Wachstumsphase. Der
 * Zeitraum darf über den Jahreswechsel gehen (z. B. 11-01 bis 03-15). `heute` ist das lokale Datum des Nutzers
 * (`heuteLokal`), nie das UTC-Datum. Der Vergleich der Monat-Tag-Texte `MM-TT` ist chronologisch.
 */
export function pflegephase(von: string, bis: string, heute: string): Pflegephase {
  const tag = monatTag(heute);
  const inRuhe = von <= bis ? tag >= von && tag <= bis : tag >= von || tag <= bis;
  return inRuhe ? "ruhe" : "wachstum";
}
