// Light overview: species sorted by lux demand with position recommendations (US-LIC-03, FR-LIC-05).
// Pure derivation, never stored (P-01). Every species with at least one active specimen; an unknown lux demand stays
// unknown and is listed last with its next step, never dropped or guessed (P-08, P-09, P-10).
import {
  lightNeedUnknown,
  recommendPosition,
  type PositionRecommendation,
  type PositionThresholds,
  zoneDerive,
  type LightZone,
} from "../../light";
import type { Species } from "../../catalog";
import type { CareProfileReader } from "../care-profile/care-profile-types";
import type { SpeciesSource, SpecimenRow } from "../shared/types";
import { isActive } from "../shared/types";

export interface LightOverviewRow {
  readonly speciesId: string;
  readonly speciesName: string;
  /** `null` = the catalog does not know the lux demand (P-08). */
  readonly lightDemandLux: number | null;
  /** `null` = no recommendation, because the lux demand is unknown. */
  readonly position: PositionRecommendation | null;
  /** My care-profile zone first, else the zone derived from the lux demand; `null` = unknown (P-08). */
  readonly zone: LightZone | null;
  /** No zone of my own and the lux need or default level is unknown: the next step is "Lichtbedarf eintragen" (US-LIC-01). */
  readonly lightNeedUnknown: boolean;
}

export interface LightOverview {
  readonly rows: readonly LightOverviewRow[];
}

interface Dependencies {
  readonly specimens: { list(userId: string): Promise<readonly SpecimenRow[]> };
  readonly species: Pick<SpeciesSource, "findMany">;
  readonly zones: { list(userId: string): Promise<readonly LightZone[]> };
  /** My care profiles (US-BES-09): their zone comes before the derived one (US-LIC-01). */
  readonly profiles?: CareProfileReader;
}

/** What a row needs besides the species: the zones of the account, my profile zones and the position thresholds. */
interface RowContext {
  readonly zones: readonly LightZone[];
  readonly profileZone: ReadonlyMap<string, string | null>;
  readonly thresholds: PositionThresholds | undefined;
}

/** One row: the zone of my care profile first, then the zone derived from the catalog (US-LIC-01, P-08). */
function rowOf(speciesId: string, species: Species, context: RowContext): LightOverviewRow {
  const { zones, thresholds } = context;
  const own = zones.find((z) => z.id === context.profileZone.get(speciesId));
  const derivation = zoneDerive(
    {
      lightDemandLux: species.lightDemandLux,
      standardLevel: species.standardLevel,
      // `softLeaf` is the catalog field of the species, as in the distribution and the care profile (US-LIC-01).
      softLeaf: species.softLeaf,
    },
    zones,
  );
  const zone = own ?? (derivation.kind === "zone" ? derivation.zone : null);
  return {
    speciesId,
    speciesName: species.latinName,
    lightDemandLux: species.lightDemandLux,
    position: recommendPosition(species.lightDemandLux, thresholds),
    zone,
    lightNeedUnknown: zone === null && lightNeedUnknown(species),
  };
}

/**
 * Light overview: one row per species with at least one active specimen, sorted descending by lux demand; species
 * with an unknown lux demand come last (no position). The zone is my care-profile zone first, else the zone derived
 * from the lux demand (US-LIC-03, US-LIC-01). The position uses the keeper's thresholds (FR-LIC-05), the defaults without.
 */
export async function lightOverview(
  deps: Dependencies,
  userId: string,
  thresholds?: PositionThresholds,
): Promise<LightOverview> {
  const [specimens, allZones, profiles] = await Promise.all([
    deps.specimens.list(userId),
    deps.zones.list(userId),
    deps.profiles?.list(userId) ?? [],
  ]);

  const zones = [...allZones].sort((a, b) => a.sortOrder - b.sortOrder);
  const profileZone = new Map(profiles.map((p) => [p.speciesId, p.lightZoneId] as const));

  // Find unique species IDs from active specimens
  const activeSpecimens = specimens.filter(isActive);
  const speciesIds = [...new Set(activeSpecimens.map((s) => s.speciesId))];

  // Load species data
  const speciesList = await deps.species.findMany(userId, speciesIds);

  // Build one row per readable species; a species the account cannot read is skipped
  const rows: LightOverviewRow[] = [];
  for (let i = 0; i < speciesIds.length; i++) {
    const speciesId = speciesIds[i];
    const species = speciesList[i];
    if (!speciesId || !species) continue;
    rows.push(rowOf(speciesId, species, { zones, profileZone, thresholds }));
  }

  // Sort descending by lux demand; an unknown demand sorts last
  rows.sort((a, b) => (b.lightDemandLux ?? -1) - (a.lightDemandLux ?? -1));

  return { rows };
}
