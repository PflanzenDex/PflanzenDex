// Archive (US-BES-07): the archived specimens of an account, viewable and restorable.
import { speciesDisplayName } from "../shared/name";
import type { SpeciesSource, SpecimenStore } from "../shared/types";

export interface ArchivedEntry {
  readonly id: string;
  readonly name: string;
  /** Name of the species, `null` means "unknown" (P-08). */
  readonly speciesName: string | null;
  readonly caughtAt: string | null;
  /** Lokales Kalenderdatum `JJJJ-MM-TT` (NFR-08). */
  readonly archivedAt: string;
  readonly archivedReason: string;
}

export interface ArchivedDependencies {
  readonly specimens: Pick<SpecimenStore, "list">;
  readonly species: SpeciesSource;
}

/** Most recently archived first; with the same date the name decides, so the order is stable. */
const newestFirst = (a: ArchivedEntry, b: ArchivedEntry) =>
  b.archivedAt.localeCompare(a.archivedAt) || a.name.localeCompare(b.name, "de");

/** The archived specimens of the account (US-BES-07); never a foreign one (P-04, the store knows only the account). */
export async function specimenArchived(
  deps: ArchivedDependencies,
  userId: string,
): Promise<readonly ArchivedEntry[]> {
  const rows = (await deps.specimens.list(userId)).filter((z) => z.status === "archived");
  const speciesIds = [...new Set(rows.map((z) => z.speciesId))];
  const species = await Promise.all(speciesIds.map((id) => deps.species.find(userId, id)));
  const names = new Map(
    speciesIds.map((id, i) => [id, species[i] ? speciesDisplayName(species[i]) : null] as const),
  );
  return rows
    .map((z) => ({
      id: z.id,
      name: z.name,
      speciesName: names.get(z.speciesId) ?? null,
      caughtAt: z.caughtAt,
      archivedAt: z.archivedAt ?? "",
      archivedReason: z.archivedReason ?? "",
    }))
    .sort(newestFirst);
}
