// Öffentliche Schnittstelle des Moduls `kern` (Operations-Engine, Ergebnis, Fehler, Ports).
export * from "./meta";
export { FEHLERTEXTE, FEHLERCODE_FORMAT, fehler } from "./fehler";
export type { Fehler, Fehlercode, Fehlerdetail } from "./fehler";
export { fehlgeschlagen, ok } from "./ergebnis";
export type { Ergebnis } from "./ergebnis";
export {
  bezeichnerFeld,
  ganzzahlFeld,
  istKennung,
  kennungFeld,
  objekt,
  textFeld,
  wahlFeld,
  zahlFeld,
} from "./validierung";
export type { Schema } from "./validierung";
export { definiereOperation, fuehreAus } from "./operation";
export type { Abhaengigkeiten, Aufruf, Operation } from "./operation";
export { kanonisch } from "./kanonisch";
export type {
  AngemeldeterKontext,
  Beginn,
  IdempotenzSchluessel,
  IdempotenzSpeicher,
  Kontext,
} from "./ports";
