import { istKennung } from "../kern";
import type { ArtQuelle, ExemplarSpeicher } from "../bestand";
import type { MessAnsicht, MessungSpeicher } from "./typen";

export interface AnsichtAbhaengigkeiten {
  readonly messungen: MessungSpeicher;
  readonly exemplare: Pick<ExemplarSpeicher, "finde">;
  readonly arten: ArtQuelle;
}

/**
 * Die Ansicht „Messen“ eines Exemplars (US-WAC-01): Was gemessen wird, die Messungen, die letzte Messung und ihre
 * Bewertung. Alles ist abgeleitet und nie gespeichert (P-01). `null`, wenn es das Exemplar nicht gibt oder es einem
 * anderen Konto gehört (beides sieht gleich aus, P-04).
 */
export async function messAnsicht(
  deps: AnsichtAbhaengigkeiten,
  nutzerId: string,
  exemplarId: string,
): Promise<MessAnsicht | null> {
  if (!istKennung(exemplarId)) return null;
  const exemplar = await deps.exemplare.finde(nutzerId, exemplarId.toLowerCase());
  if (!exemplar) return null;
  const art = await deps.arten.finde(nutzerId, exemplar.artId);
  const messungen = await deps.messungen.liste(nutzerId, exemplar.id);
  const letzte = messungen[0] ?? null;
  return {
    exemplarId: exemplar.id,
    wachstumsmass: art?.wachstumsmass ?? null,
    messungen,
    letzte,
    letzteBewertung: letzte?.qualitaet ?? null,
  };
}
