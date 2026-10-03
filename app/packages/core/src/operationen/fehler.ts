// Stabile, maschinenlesbare Fehlercodes `<domäne>.<grund>` (FR-QG-11). Codes werden nie umbenannt.
export const FEHLERTEXTE = {
  "eingabe.ungueltig": "Die Eingabe ist ungültig. Bitte prüfe die markierten Felder.",
  "zugriff.nicht_angemeldet": "Du bist nicht angemeldet. Bitte melde dich an.",
  "zugriff.verweigert": "Darauf hast du keinen Zugriff.",
  "idempotenz.schluessel_fehlt": "Der Wiederholungsschutz-Schlüssel fehlt.",
  "idempotenz.schluessel_konflikt":
    "Dieser Schlüssel wurde bereits mit anderen Angaben verwendet. Bitte versuche es neu.",
  "idempotenz.laeuft_noch": "Dieselbe Aktion läuft noch. Bitte warte einen Moment.",
  "system.unerwartet":
    "Es ist ein unerwarteter Fehler aufgetreten. Bitte versuche es später erneut.",
  "standort.name_vergeben": "Einen Standort mit diesem Namen gibt es schon.",
} as const;

export type Fehlercode = keyof typeof FEHLERTEXTE;

export const FEHLERCODE_FORMAT = /^[a-z]+\.[a-z_]+$/;

export interface Fehlerdetail {
  readonly feld: string;
  readonly code: Fehlercode;
}

export interface Fehler {
  readonly code: Fehlercode;
  /** Deutscher Text aus FEHLERTEXTE; Oberfläche und KI übersetzen nach `code`, nie nach dem Text. */
  readonly text: string;
  readonly details?: readonly Fehlerdetail[];
  /** Nur für Protokolle, nie für die Anzeige (FR-QG-11). */
  readonly ursache?: unknown;
}

export function fehler(
  code: Fehlercode,
  zusatz: { details?: readonly Fehlerdetail[]; ursache?: unknown } = {},
): Fehler {
  return { code, text: FEHLERTEXTE[code], ...zusatz };
}
