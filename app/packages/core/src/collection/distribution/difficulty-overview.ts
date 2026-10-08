// Species compared by difficulty (US-BES-05): one row per species with at least one active specimen, easiest first.
// Pure derivation, never stored (P-01). A value the catalog does not know stays `null` ("unbekannt", P-08).
import { zoneDerive, type LightZone } from "../../light";
import { speciesDisplayName } from "../shared/name";
import { isActive, type SpeciesSource, type SpecimenRow } from "../shared/types";

export interface DifficultyRow {
  readonly speciesId: string;
  readonly speciesName: string;
  readonly botanicalName: string;
  /** The zone derived from the lux demand; `null` = unknown, e.g. the account has no adult zone. */
  readonly zone: LightZone | null;
  readonly wateringHint: string | null;
  readonly substrate: string | null;
  readonly pruning: string | null;
  readonly successCriteria: string;
  /** 1 easy, 2 medium, 3 hard (DM-BES-01). */
  readonly difficulty: number;
}

export interface DifficultyOverview {
  readonly rows: readonly DifficultyRow[];
}

export interface DifficultyDependencies {
  readonly specimens: { list(userId: string): Promise<readonly SpecimenRow[]> };
  readonly species: Pick<SpeciesSource, "findMany">;
  readonly zones: { list(userId: string): Promise<readonly LightZone[]> };
}

/**
 * One row per readable species with an active specimen, sorted by difficulty ascending and then by name. Archived
 * specimens do not count (US-BES-07); a species the account cannot read is skipped.
 */
export async function difficultyOverview(
  deps: DifficultyDependencies,
  userId: string,
): Promise<DifficultyOverview> {
  const [specimens, zones] = await Promise.all([
    deps.specimens.list(userId),
    deps.zones.list(userId),
  ]);
  const ids = [...new Set(specimens.filter(isActive).map((s) => s.speciesId))];
  const found = await deps.species.findMany(userId, ids);
  const rows: DifficultyRow[] = [];
  for (const species of found) {
    if (!species) continue;
    // The catalog has no field for soft-leaved C3 plants yet (US-LIC-01), so it is never assumed.
    const derived = zoneDerive(
      {
        lightDemandLux: species.lightDemandLux,
        standardLevel: species.standardLevel,
        softLeaf: false,
      },
      zones,
    );
    rows.push({
      speciesId: species.id,
      speciesName: speciesDisplayName(species),
      botanicalName: species.latinName,
      zone: derived.kind === "zone" ? derived.zone : null,
      wateringHint: species.wateringHint,
      substrate: species.substrate,
      pruning: species.pruning,
      successCriteria: species.successCriteria,
      difficulty: species.difficulty,
    });
  }
  rows.sort(
    (a, b) => a.difficulty - b.difficulty || a.botanicalName.localeCompare(b.botanicalName, "de"),
  );
  return { rows };
}
