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
  "pruefung.bereits_vorhanden": "Für dieses Objekt läuft schon eine Prüfung.",
  "pruefung.nicht_gefunden": "Diesen Prüfvorgang gibt es nicht.",
  "pruefung.status_unzulaessig": "Dieser Vorgang ist schon entschieden.",
  "pruefung.grund_fehlt": "Zum Zurückweisen gehört ein Grund, den der Ersteller sehen kann.",
  "art.dublette":
    "Diese Art gibt es schon (gleicher Name oder Synonym). Wähle die vorhandene Art, statt eine zweite anzulegen.",
  "art.nicht_gefunden": "Diese Art gibt es nicht.",
  "standort.name_vergeben": "Einen Standort mit diesem Namen gibt es schon.",
  "standort.nicht_gefunden": "Diesen Standort gibt es nicht.",
  "lichtzone.name_vergeben": "Eine Lichtzone mit diesem Namen gibt es schon.",
  "lichtzone.nicht_gefunden": "Diese Lichtzone gibt es nicht.",
  "lichtzone.in_benutzung":
    "Diese Lichtzone wird noch genutzt und kann nicht gelöscht werden. Ordne die genannten Einträge zuerst einer anderen Zone zu.",
  "lichtzone.nicht_leer":
    "Du hast schon Lichtzonen. Die Voreinstellung ist nur für ein Konto ohne Zonen.",
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
  /** Fachliche Angaben zur Anzeige, z. B. welche Einträge eine Zone nutzen (P-10: nichts verschwindet still). */
  readonly daten?: unknown;
  /** Nur für Protokolle, nie für die Anzeige (FR-QG-11). */
  readonly ursache?: unknown;
}

export function fehler(
  code: Fehlercode,
  zusatz: { details?: readonly Fehlerdetail[]; daten?: unknown; ursache?: unknown } = {},
): Fehler {
  return { code, text: FEHLERTEXTE[code], ...zusatz };
}
