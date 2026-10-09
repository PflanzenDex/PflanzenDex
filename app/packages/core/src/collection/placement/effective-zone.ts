// Effective light zone of a specimen (FR-LIC-02, US-BES-06, US-LIC-02): one rule for card and distribution, so both
// name the same zone (#592). Derived and never stored (P-01); what cannot be derived stays `null` (P-08).
import { zoneDerive, type LightLocation, type LightZone } from "../../light";
import type { Species } from "../../catalog";
import { cuttingLight } from "./cutting-light";
import type { SpecimenRow } from "../shared/types";

/** Where the zone comes from: cutting light, the location, my care profile (US-BES-09) or the species' lux need. */
export type ZoneSource = "cutting" | "location" | "profile" | "species";

export interface EffectiveZone {
  readonly zone: LightZone;
  readonly source: ZoneSource;
}

export interface ZoneContext {
  readonly zones: readonly LightZone[];
  readonly locations: readonly LightLocation[];
  readonly species: ReadonlyMap<string, Species | null>;
  /** Zone override of the care profile per species (US-BES-09). */
  readonly overrides: ReadonlyMap<string, string>;
}

/** Zone of the species: my override first, else derived from the lux need. "Soft leaf" is never assumed. */
function speciesZone(z: SpecimenRow, k: ZoneContext): EffectiveZone | null {
  const species = k.species.get(z.speciesId);
  if (!species) return null;
  const own = k.zones.find((l) => l.id === k.overrides.get(z.speciesId));
  if (own) return { zone: own, source: "profile" };
  const a = zoneDerive(
    {
      lightDemandLux: species.lightDemandLux,
      standardLevel: species.standardLevel,
      softLeaf: false,
    },
    k.zones,
  );
  return a.kind === "zone" ? { zone: a.zone, source: "species" } : null;
}

/**
 * The zone a specimen stands in: a cutting under cutting light (US-BES-04), otherwise the zone of its location
 * (specimen before species), otherwise the zone of its species. Archiving is the caller's concern.
 */
export function effectiveZone(z: SpecimenRow, k: ZoneContext): EffectiveZone | null {
  if (z.status === "cutting") {
    const lowest = cuttingLight(k.zones);
    return lowest ? { zone: lowest, source: "cutting" } : null;
  }
  const location = k.locations.find((s) => s.id === z.locationId);
  const own = k.zones.find((l) => l.id === location?.lightZoneId);
  return own ? { zone: own, source: "location" } : speciesZone(z, k);
}

/** Overrides of the care profiles as a map species → zone (US-BES-09). */
export const zoneOverrides = (
  profiles: readonly { speciesId: string; lightZoneId: string | null }[],
): ReadonlyMap<string, string> =>
  new Map(profiles.flatMap((p) => (p.lightZoneId ? [[p.speciesId, p.lightZoneId] as const] : [])));
