import { istKennung } from "../validierung";
import { normalisiere } from "./name";
import type { Art, ArtSpeicher, ArtTreffer } from "./typen";

/**
 * Sucht nach lateinischem, deutschem, englischem Namen oder Synonym (Teilwort genügt, Groß-/Kleinschreibung und
 * Akzente egal). Ein leerer Suchtext listet alle sichtbaren Arten. Gesehen wird, was der Nutzer sehen darf.
 */
export function artSuchen(
  speicher: ArtSpeicher,
  nutzerId: string,
  text: string,
): Promise<readonly ArtTreffer[]> {
  return speicher.suche(nutzerId, normalisiere(text) || null);
}

/** `null`, wenn es die Art nicht gibt oder sie für den Nutzer nicht sichtbar ist (beides sieht gleich aus, P-04). */
export async function artLaden(
  speicher: ArtSpeicher,
  nutzerId: string,
  id: string,
): Promise<Art | null> {
  return istKennung(id) ? speicher.finde(nutzerId, id.toLowerCase()) : null;
}
