import { type AngemeldeterKontext } from "../kern";
import type { PruefungSpeicher } from "./typen";

/** Prüfer ist, wer Betreiber oder Prüfer ist (FR-BES-14). Ohne Rolle bleibt nur das Vorschlagen. */
export const istPruefer =
  (speicher: PruefungSpeicher) =>
  async (kontext: AngemeldeterKontext): Promise<boolean> =>
    (await speicher.rollen(kontext.nutzerId)).length > 0;
