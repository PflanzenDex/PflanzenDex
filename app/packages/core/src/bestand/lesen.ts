import { istKennung } from "../kern";
import { istAktiv, type Exemplar, type ExemplarSpeicher, type ExemplarZeile } from "./typen";

/**
 * Hängt die abgeleiteten Listen an (P-01: berechnet, nie gespeichert). Messreihe (WAC) und Behandlungsliste (BEH)
 * gibt es noch nicht, also sind beide leer; sobald diese Module Daten liefern, kommen sie über deren Ports hierher.
 */
export const mitAbleitungen = (zeile: ExemplarZeile): Exemplar => ({
  ...zeile,
  messreihe: [],
  behandlungen: [],
});

/** Die Liste der aktiven Exemplare; archivierte stehen im Archiv (US-BES-07), nicht hier. */
export async function exemplareListe(
  speicher: ExemplarSpeicher,
  nutzerId: string,
): Promise<readonly Exemplar[]> {
  return (await speicher.liste(nutzerId)).filter(istAktiv).map(mitAbleitungen);
}

/** Auch ein archiviertes Exemplar bleibt mit Historie ladbar (US-BES-07). `null`, wenn es das Exemplar nicht gibt oder es einem anderen Konto gehört (beides sieht gleich aus, P-04). */
export async function exemplarLaden(
  speicher: ExemplarSpeicher,
  nutzerId: string,
  id: string,
): Promise<Exemplar | null> {
  if (!istKennung(id)) return null;
  const zeile = await speicher.finde(nutzerId, id.toLowerCase());
  return zeile ? mitAbleitungen(zeile) : null;
}
