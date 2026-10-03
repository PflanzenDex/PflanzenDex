import type { SollStandortQuelle } from "./typen";

/**
 * Bis die Pflegephasen (PHA) und das Pflegeprofil (BES-09) existieren, kennt niemand einen Soll-Standort. Statt einen
 * Standort zu erfinden (P-08), bleibt er „unbekannt“; der Halter wählt ihn selbst.
 */
export const KEIN_SOLL_STANDORT: SollStandortQuelle = { sollStandort: async () => null };
