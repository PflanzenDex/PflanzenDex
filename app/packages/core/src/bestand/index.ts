// Öffentliche Schnittstelle des Moduls `bestand` (ADR 0003): Exemplare (US-BES-02).
export { exemplarAnlegen } from "./anlegen";
export type { AnlegenAbhaengigkeiten } from "./anlegen";
export { exemplarLaden, exemplareListe } from "./lesen";
export { artAnzeigename, exemplarName } from "./name";
export { KEIN_SOLL_STANDORT } from "./soll-standort";
export { EXEMPLAR_GRENZEN, EXEMPLAR_STATUS } from "./typen";
export type {
  ArtQuelle,
  Exemplar,
  ExemplarSpeicher,
  ExemplarStatus,
  ExemplarWerte,
  ExemplarZeile,
  SollStandortQuelle,
} from "./typen";
