// Öffentliche Schnittstelle des Moduls `pflege` (ADR 0003): Pflegephasen (US-PHA-01).
export { PFLEGEPHASEN, monatTag, pflegephase } from "./phase";
export type { Pflegephase } from "./phase";
export { pflegephasenListe } from "./phasen";
export type { PhasenAbhaengigkeiten, PhasenZeile } from "./phasen";
