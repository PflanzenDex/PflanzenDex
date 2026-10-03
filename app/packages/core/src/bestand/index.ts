// Öffentliche Schnittstelle des Moduls `bestand` (ADR 0003): Exemplare (US-BES-02).
export { exemplarAnlegen } from "./anlegen";
export type { AnlegenAbhaengigkeiten } from "./anlegen";
export { exemplarLaden, exemplareListe } from "./lesen";
export { artAnzeigename, exemplarName } from "./name";
export { KEIN_SOLL_STANDORT } from "./soll-standort";
export { KEINE_BEHANDLUNGEN, KEINE_MESSUNGEN, exemplarKarten, faelligkeit } from "./karten";
export type { KartenAbhaengigkeiten } from "./karten";
export { zonenVerteilung } from "./verteilung";
export type {
  NichtGezaehlt,
  Verteilung,
  VerteilungsAbhaengigkeiten,
  VerteilungsHinweis,
  ZonenZaehlung,
} from "./verteilung-typen";
export { MESS_QUALITAETEN } from "./karten-typen";
export type {
  BehandlungsQuelle,
  ExemplarKarte,
  Faelligkeit,
  LetzteMessung,
  MessQualitaet,
  MessungsAnsicht,
  MessungsQuelle,
  OffeneBehandlung,
} from "./karten-typen";
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
