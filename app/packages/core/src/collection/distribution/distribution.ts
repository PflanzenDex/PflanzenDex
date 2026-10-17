// Distribution of the specimens over the light zones (US-LIC-02, FR-LIC-04): a pure derivation, never stored (P-01).
// The same count will later serve the wishlist prioritization (specimen level, zones 2 to 4 only).
import type { LightZone } from "../../light";
import { cuttingLight } from "../placement/cutting-light";
import { effectiveZone, zoneOverrides, type ZoneContext } from "../placement/effective-zone";
import { distributionHint } from "./distribution-hint";
import type { NotCounted, Distribution, DistributionDependencies } from "./distribution-types";
import { isActive, type SpecimenRow } from "../shared/types";

type Place = LightZone | "cuttingLight" | "archived" | "unknown";

/**
 * Where a specimen counts (FR-LIC-02): archive and cutting first (`isActive`, the same rule as in list and cards, US-BES-07), then
 * the effective zone that the card shows too (#592). The lowest zone of the account is the cutting light.
 */
function placeFrom(z: SpecimenRow, k: ZoneContext): Place {
  if (!isActive(z)) return "archived";
  if (z.status === "cutting") return "cuttingLight";
  const own = effectiveZone(z, k);
  if (!own) return "unknown";
  return own.zone.id === cuttingLight(k.zones)?.id ? "cuttingLight" : own.zone;
}

const thinnestZones = (zones: readonly { zone: LightZone; count: number }[]): LightZone[] => {
  const counted = zones.reduce((sum, z) => sum + z.count, 0);
  if (counted === 0) return [];
  const smallest = Math.min(...zones.map((z) => z.count));
  return zones.filter((z) => z.count === smallest).map((z) => z.zone);
};

/**
 * Distribution of the specimens of the account over zones 2 to 4. Only the data of the account flows in (P-04). What is
 * not counted (cutting light, archived, zone unknown) is in `notCounted`.
 */
export async function zoneDistribution(
  deps: DistributionDependencies,
  userId: string,
): Promise<Distribution> {
  const [rows, locations, allZones, profiles] = await Promise.all([
    deps.specimens.list(userId),
    deps.locations.list(userId),
    deps.zones.list(userId),
    deps.profiles?.list(userId) ?? [],
  ]);
  const zones = [...allZones].sort((a, b) => a.sortOrder - b.sortOrder);
  const speciesIds = [...new Set(rows.map((z) => z.speciesId))];
  const read = await deps.species.findMany(userId, speciesIds);
  const context: ZoneContext = {
    zones,
    locations,
    species: new Map(speciesIds.map((id, i) => [id, read[i] ?? null] as const)),
    overrides: zoneOverrides(profiles),
  };
  const count = new Map<string, number>();
  const rest = { cuttingLight: 0, archived: 0, zoneUnknown: 0 };
  for (const z of rows) {
    const place = placeFrom(z, context);
    if (place === "cuttingLight") rest.cuttingLight += 1;
    else if (place === "archived") rest.archived += 1;
    else if (place === "unknown") rest.zoneUnknown += 1;
    else count.set(place.id, (count.get(place.id) ?? 0) + 1);
  }
  const counted = zones.slice(1).map((zone) => ({ zone, count: count.get(zone.id) ?? 0 }));
  const thinnest = thinnestZones(counted);
  const notCounted: NotCounted = rest;
  return {
    zones: counted,
    thinnest,
    notCounted,
    hint: distributionHint(counted, thinnest),
  };
}
