// Archiv (US-BES-07): die archivierten Exemplare eines Kontos, einsehbar und wiederherstellbar.
import { artAnzeigename } from "./name";
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

/** Zuletzt archiviert zuerst; bei gleichem Datum entscheidet der Name, damit die Reihenfolge stabil ist. */
const neuesteZuerst = (a: ArchivEintrag, b: ArchivEintrag) =>
  b.archiviertAm.localeCompare(a.archiviertAm) || a.name.localeCompare(b.name, "de");

/** Die archivierten Exemplare des Kontos (US-BES-07); nie ein fremdes (P-04, der Speicher kennt nur das Konto). */
export async function exemplarArchiv(
  deps: ArchivAbhaengigkeiten,
  nutzerId: string,
): Promise<readonly ArchivEintrag[]> {
  const zeilen = (await deps.exemplare.liste(nutzerId)).filter((z) => z.status === "archiviert");
  const artIds = [...new Set(zeilen.map((z) => z.artId))];
  const arten = await Promise.all(artIds.map((id) => deps.arten.finde(nutzerId, id)));
  const namen = new Map(
    artIds.map((id, i) => [id, arten[i] ? artAnzeigename(arten[i]) : null] as const),
  );
  return zeilen
    .map((z) => ({
      id: z.id,
      name: z.name,
      artName: namen.get(z.artId) ?? null,
      gefangenAm: z.gefangenAm,
      archiviertAm: z.archiviertAm ?? "",
      archiviertGrund: z.archiviertGrund ?? "",
    }))
    .sort(neuesteZuerst);
}
