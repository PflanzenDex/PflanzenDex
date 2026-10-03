import type { Fehler, Fehlercode } from "@pflanzendex/core";

type Status = 400 | 401 | 403 | 404 | 409 | 500;

// Stabile Zuordnung Fehlercode -> HTTP-Status (FR-QG-11). Unbekannte Codes sind ein Serverfehler, nie ein Erfolg.
const STATUS: Partial<Record<Fehlercode, Status>> = {
  "eingabe.ungueltig": 400,
  "idempotenz.schluessel_fehlt": 400,
  "zugriff.nicht_angemeldet": 401,
  "zugriff.verweigert": 403,
  "lichtzone.nicht_gefunden": 404,
  "standort.nicht_gefunden": 404,
  "art.nicht_gefunden": 404,
  "exemplar.nicht_gefunden": 404,
  "art.dublette": 409,
  "exemplar.name_vergeben": 409,
  "exemplar.bereits_archiviert": 409,
  "exemplar.nicht_archiviert": 409,
  "exemplar.archiviert": 409,
  "lichtzone.name_vergeben": 409,
  "standort.name_vergeben": 409,
  "lichtzone.in_benutzung": 409,
  "lichtzone.nicht_leer": 409,
  "idempotenz.schluessel_konflikt": 409,
  "idempotenz.laeuft_noch": 409,
};

export const statusFuer = (f: Fehler): Status => STATUS[f.code] ?? 500;

/** Antwortkörper: Code für Programme, Text für Menschen, `daten` z. B. mit den Nutzern einer Zone. Nie die Ursache. */
export const fehlerKoerper = (f: Fehler) => ({
  fehler: {
    code: f.code,
    text: f.text,
    ...(f.details ? { details: f.details } : {}),
    ...(f.daten !== undefined ? { daten: f.daten } : {}),
  },
});
