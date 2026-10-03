// Öffentliche Schnittstelle des Moduls `kern` (ADR 0003): Zugriff auf die API mit Anmeldung und Wiederholungsschutz, gemeinsamer Ladefehler.
export { aufruf, erzeugeSchreiben } from "./api";
export type { Antwort, ApiFehler, Schreiben } from "./api";
export { LadeFehler } from "./lade-fehler";
