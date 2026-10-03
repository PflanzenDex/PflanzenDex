// Archiv (US-BES-07): die archivierten Exemplare eines Kontos, einsehbar und wiederherstellbar.
import type { ArtQuelle, ExemplarSpeicher } from "./typen";

export interface ArchivEintrag {
  readonly id: string;
  readonly name: string;
  /** Name der Art, `null` heißt „unbekannt“ (P-08). */
  readonly artName: string | null;
  readonly gefangenAm: string | null;
  /** Lokales Kalenderdatum `JJJJ-MM-TT` (NFR-08). */
  readonly archiviertAm: string;
  readonly archiviertGrund: string;
}

export interface ArchivAbhaengigkeiten {
  readonly exemplare: Pick<ExemplarSpeicher, "liste">;
  readonly arten: ArtQuelle;
}

// Skelett für den roten Nachweis (P-06).
export async function exemplarArchiv(
  deps: ArchivAbhaengigkeiten,
  nutzerId: string,
): Promise<readonly ArchivEintrag[]> {
  void deps;
  void nutzerId;
  return [];
}
