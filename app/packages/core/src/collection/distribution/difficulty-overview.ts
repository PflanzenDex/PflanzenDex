// Species compared by difficulty (US-BES-05): one row per species with at least one active specimen, easiest first.
// Pure derivation, never stored (P-01). A value the catalog does not know stays `null` ("unbekannt", P-08).
import { zoneDerive, type LightZone } from "../../light";
import { speciesDisplayName } from "../shared/name";
import { isActive, type SpeciesSource, type SpecimenRow } from "../shared/types";
import type { CareProfile, CareProfileReader } from "../care-profile/care-profile-types";

export interface DifficultyRow {
  readonly speciesId: string;
  readonly speciesName: string;
  readonly botanicalName: string;
  /** My zone of the care profile, else the zone derived from the lux demand; `null` = unknown (no adult zone). */
  readonly zone: LightZone | null;
  /** Where the zone comes from (US-BES-09); `null` when the zone is unknown. */
  readonly zoneSource: "profile" | "species" | null;
  readonly wateringHint: string | null;
  /** My watering intervals in days from the care profile (US-BES-09); `null` without any. */
  readonly ownWatering: {
    readonly growthDays: number | null;
    readonly dormancyDays: number | null;
  } | null;
  readonly substrate: string | null;
  readonly pruning: string | null;
  readonly successCriteria: string;
  /** 1 easy, 2 medium, 3 hard (DM-BES-01). */
  readonly difficulty: number;
}

export interface DifficultyOverview {
  readonly rows: readonly DifficultyRow[];
  /** Species of active specimens the account can no longer read (e.g. a re-pointed merged proposal); named, not dropped silently (P-10). */
  readonly unreadable: number;
}

export interface DifficultyDependencies {
  readonly specimens: { list(userId: string): Promise<readonly SpecimenRow[]> };
  readonly species: Pick<SpeciesSource, "findMany">;
  readonly zones: { list(userId: string): Promise<readonly LightZone[]> };
  /** My care profiles (US-BES-09); without it the catalog values apply. */
  readonly profiles?: CareProfileReader;
}

/** The watering intervals of my care profile, `null` when it sets none. */
function ownWatering(p: CareProfile | undefined): DifficultyRow["ownWatering"] {
  if (!p || (p.wateringGrowthDays === null && p.wateringDormancyDays === null)) return null;
  return { growthDays: p.wateringGrowthDays, dormancyDays: p.wateringDormancyDays };
}

/**
 * One row per readable species with an active specimen, sorted by difficulty ascending and then by name. Archived
 * specimens do not count (US-BES-07); a species the account cannot read has no row, but is counted in `unreadable`.
 */
export async function difficultyOverview(
  deps: DifficultyDependencies,
  userId: string,
): Promise<DifficultyOverview> {
  const [specimens, zones, profiles] = await Promise.all([
    deps.specimens.list(userId),
    deps.zones.list(userId),
    deps.profiles?.list(userId) ?? [],
  ]);
  const profileOf = new Map(profiles.map((p) => [p.speciesId, p] as const));
  const ids = [...new Set(specimens.filter(isActive).map((s) => s.speciesId))];
  const found = await deps.species.findMany(userId, ids);
  const rows: DifficultyRow[] = [];
  let unreadable = 0;
  for (const species of found) {
    if (!species) {
      unreadable += 1;
      continue;
    }
    // The catalog has no field for soft-leaved C3 plants yet (US-LIC-01), so it is never assumed.
    const derived = zoneDerive(
      {
        lightDemandLux: species.lightDemandLux,
        standardLevel: species.standardLevel,
        softLeaf: false,
      },
      zones,
    );
    const profile = profileOf.get(species.id);
    const own = zones.find((z) => z.id === profile?.lightZoneId);
    const zone = own ?? (derived.kind === "zone" ? derived.zone : null);
    rows.push({
      speciesId: species.id,
      speciesName: speciesDisplayName(species),
      botanicalName: species.latinName,
      zone,
      zoneSource: own ? "profile" : zone ? "species" : null,
      wateringHint: species.wateringHint,
      ownWatering: ownWatering(profile),
      substrate: species.substrate,
      pruning: species.pruning,
      successCriteria: species.successCriteria,
      difficulty: species.difficulty,
    });
  }
  rows.sort(
    (a, b) => a.difficulty - b.difficulty || a.botanicalName.localeCompare(b.botanicalName, "de"),
  );
  return { rows, unreadable };
}
