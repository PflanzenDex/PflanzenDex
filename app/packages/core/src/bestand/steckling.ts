// Stecklingslicht (US-BES-04, FR-LIC-02): die niedrigste Lichtzone des Kontos, abgeleitet und nie gespeichert (P-01).
// Karten und Verteilung benutzen dieselbe Regel, damit beide ein Exemplar gleich einordnen.
import type { Lichtzone } from "../licht";

/** Die Zone mit der kleinsten Reihenfolge, `null` ohne Zonen (unbekannt, P-08). */
export const stecklingslicht = (zonen: readonly Lichtzone[]): Lichtzone | null =>
  zonen.reduce<Lichtzone | null>(
    (niedrigste, z) => (!niedrigste || z.reihenfolge < niedrigste.reihenfolge ? z : niedrigste),
    null,
  );
