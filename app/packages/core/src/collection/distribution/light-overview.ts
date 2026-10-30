// Light overview: species sorted by lux demand with position recommendations (US-LIC-03, FR-LIC-05).
// Pure derivation, never stored (P-01). Every species with at least one active specimen; an unknown lux demand stays
// unknown and is listed last with its next step, never dropped or guessed (P-08, P-09, P-10).
import {
  recommendPosition,
  type PositionRecommendation,
  type PositionThresholds,
  zoneDerive,
  type LightZone,
} from "../../light";
import type { SpeciesSource, SpecimenRow } from "../shared/types";
import { isActive } from "../shared/types";

export interface LightOverviewRow {
  readonly speciesId: string;
  readonly speciesName: string;
  /** `null` = the catalog does not know the lux demand (P-08). */
  readonly lightDemandLux: number | null;
  /** `null` = no recommendation, because the lux demand is unknown. */
  readonly position: PositionRecommendation | null;
  /** `null` = zone unknown (P-08), e.g. the account has no adult zone. */
  readonly zone: LightZone | null;
}

export interface LightOverview {
  readonly rows: readonly LightOverviewRow[];
}

interface Dependencies {
  readonly specimens: { list(userId: string): Promise<readonly SpecimenRow[]> };
  readonly species: Pick<SpeciesSource, "findMany">;
  readonly zones: { list(userId: string): Promise<readonly LightZone[]> };
}

/**
 * Light overview: one row per species with at least one active specimen, sorted descending by lux demand; species
 * with an unknown lux demand come last (no position, zone unknown). Includes the zone derived from the lux demand and a position
 * recommendation (US-LIC-03). The position uses the keeper's thresholds (FR-LIC-05), the defaults without.
 */
export async function lightOverview(
  deps: Dependencies,
  userId: string,
  thresholds?: PositionThresholds,
): Promise<LightOverview> {
  const [specimens, allZones] = await Promise.all([
    deps.specimens.list(userId),
    deps.zones.list(userId),
  ]);

  const zones = [...allZones].sort((a, b) => a.sortOrder - b.sortOrder);

  // Find unique species IDs from active specimens
  const activeSpecimens = specimens.filter(isActive);
  const speciesIds = [...new Set(activeSpecimens.map((s) => s.speciesId))];

  // Load species data
  const speciesList = await deps.species.findMany(userId, speciesIds);

  // Build one row per readable species
  const rows: LightOverviewRow[] = [];

  for (let i = 0; i < speciesIds.length; i++) {
    const speciesId = speciesIds[i];
    const species = speciesList[i];

    // A species the account cannot read is skipped. An unknown lux demand has no position (null), it is not skipped.
    if (!speciesId || !species) continue;

    const position = recommendPosition(species.lightDemandLux, thresholds);

    // `softLeaf` is the catalog field of the species, as in the distribution and the care profile (US-LIC-01).
    const derivation = zoneDerive(
      {
        lightDemandLux: species.lightDemandLux,
        standardLevel: species.standardLevel,
        softLeaf: species.softLeaf,
      },
      zones,
    );

    rows.push({
      speciesId,
      speciesName: species.latinName,
      lightDemandLux: species.lightDemandLux,
      position,
      zone: derivation.kind === "zone" ? derivation.zone : null,
    });
  }

  // Sort descending by lux demand
  rows.sort((a, b) => (b.lightDemandLux ?? -1) - (a.lightDemandLux ?? -1));

  return { rows };
}
