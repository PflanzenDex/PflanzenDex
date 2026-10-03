// Öffentliche Schnittstelle des Moduls `kern` (ADR 0003): Zugriff auf die API mit Anmeldung und Wiederholungsschutz.
export { aufruf, erzeugeSchreiben } from "./api";
export type { Antwort, ApiFehler, Schreiben } from "./api";
