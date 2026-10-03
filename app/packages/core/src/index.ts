// Öffentliche Schnittstelle von `core`: Andere Pakete importieren nur von hier (AB-2).
// Jedes Modul hat unter `src/<modul>/index.ts` seine eigene öffentliche Schnittstelle (ADR 0003).
export * from "./kern";
export * from "./konto";
export * from "./katalog";
export * from "./licht";
export * from "./bestand";
export * from "./pflege";
