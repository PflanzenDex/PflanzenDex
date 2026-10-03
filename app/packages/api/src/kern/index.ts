// Öffentliche Schnittstelle des Moduls `kern` (ADR 0003): Fehlerabbildung auf HTTP.
export { fehlerKoerper } from "./fehler-http";
export type { AuthEnv } from "./auth-env";
export { koerper, schreibe } from "./route-hilfen";
export type { Antwortform, Ctx } from "./route-hilfen";
