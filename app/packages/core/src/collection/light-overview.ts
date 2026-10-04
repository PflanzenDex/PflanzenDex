// Light overview: species sorted by lux demand with position recommendations (US-LIC-03, FR-LIC-05).
// Pure derivation, never stored (P-01). Only species with at least one active specimen and a set lux demand.
import {
  recommendPosition,
  type PositionRecommendation,
  zoneDerive,
  type LightZone,
} from "../light";
import type { Species } from "../catalog";
import type { SpecimenRow } from "./types";
import { isActive } from "./types";

export interface LightOverviewRow {
  readonly speciesId: string;
  readonly speciesName: string;
  readonly lightDemandLux: number;
  readonly position: PositionRecommendation;
  readonly zone: LightZone;
}

export interface LightOverview {
  readonly rows: readonly LightOverviewRow[];
}

interface Dependencies {
  readonly specimens: { list(userId: string): Promise<readonly SpecimenRow[]> };
  readonly species: { find(userId: string, id: string): Promise<Species | null> };
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
  const speciesList = await Promise.all(speciesIds.map((id) => deps.species.find(userId, id)));

  // Build rows for species with lux demand set
  const rows: LightOverviewRow[] = [];

  for (let i = 0; i < speciesIds.length; i++) {
    const speciesId = speciesIds[i];
    const species = speciesList[i];

    // Skip if species not found or lux demand not set (also ensures speciesId and species are defined)
    if (!speciesId || !species || species.lightDemandLux === null) {
      continue;
    }

    // Derive zone from lux demand
    const derivation = zoneDerive(
      {
        lightDemandLux: species.lightDemandLux,
        standardLevel: species.standardLevel,
        softLeaf: false,
      },
      zones,
    );

    // Extract zone (always exists, worst case use a fallback)
    const zone =
      derivation.kind === "zone"
        ? derivation.zone
        : {
            id: "unknown",
            name: "unbekannt",
            luxCeiling: 0,
            ppfd: null,
            sortOrder: 999,
          };

    // Create row with position recommendation
    rows.push({
      speciesId,
      speciesName: species.latinName,
      lightDemandLux: species.lightDemandLux,
      position: recommendPosition(species.lightDemandLux),
      zone,
    });
  }

  // Sort descending by lux demand
  rows.sort((a, b) => b.lightDemandLux - a.lightDemandLux);

  return { rows };
}
