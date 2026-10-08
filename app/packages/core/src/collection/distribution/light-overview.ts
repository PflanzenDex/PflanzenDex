// Light overview: species sorted by lux demand with position recommendations (US-LIC-03, FR-LIC-05).
// Pure derivation, never stored (P-01). Only species with at least one active specimen and a set lux demand.
import {
  recommendPosition,
  type PositionRecommendation,
  zoneDerive,
  type LightZone,
} from "../../light";
import type { SpeciesSource, SpecimenRow } from "../shared/types";
import { isActive } from "../shared/types";

export interface LightOverviewRow {
  readonly speciesId: string;
  readonly speciesName: string;
  readonly lightDemandLux: number;
  readonly position: PositionRecommendation;
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
 * Light overview: one row per species with at least one active specimen and a set lux demand,
 * sorted descending by lux demand. Includes the zone derived from the lux demand and a position
 * recommendation (US-LIC-03).
 */
export async function lightOverview(deps: Dependencies, userId: string): Promise<LightOverview> {
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

    // A species the account cannot read is skipped. The lux demand is a required catalog field (1 to 200,000),
    // so every readable species has one; only a corrupt value has no recommendation and is skipped.
    if (!speciesId || !species) continue;

    const position = recommendPosition(species.lightDemandLux);
    if (!position) continue;

    // Limitation: the catalog has no "soft-leaved C3 plant" field yet (US-LIC-01 is still 🟨 for it), so
    // `softLeaf` is false here, exactly as in the distribution and the care profile.
    const derivation = zoneDerive(
      {
        lightDemandLux: species.lightDemandLux,
        standardLevel: species.standardLevel,
        softLeaf: false,
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
  rows.sort((a, b) => b.lightDemandLux - a.lightDemandLux);

  return { rows };
}
