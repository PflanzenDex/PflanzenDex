// The care profile view (US-BES-09): per species with an active specimen, or with a deviation, the catalog value and
// my deviation side by side. Derived on every request, never stored (P-01).
import type { Species } from "../catalog";
import { zoneDerive, type LightZone, type ZoneStore } from "../light";
import type { CareProfile, CareProfileReader } from "./care-profile-types";
import { effectiveProfile, type EffectiveProfile } from "./effective-profile";
import { speciesDisplayName } from "./name";
import { isActive, type SpeciesSource, type SpecimenStore } from "./types";

export interface CareProfileEntry {
  readonly speciesId: string;
  readonly speciesName: string;
  /** Active specimens of the species (archived ones do not count, US-BES-07). */
  readonly activeSpecimens: number;
  /** The catalog's watering hint as text, shown next to the interval; `null` = unknown (P-08). */
  readonly wateringHint: string | null;
  readonly profile: EffectiveProfile;
  /** At least one field deviates from the catalog. */
  readonly deviates: boolean;
}

export interface CareProfileViewDependencies {
  readonly specimens: Pick<SpecimenStore, "list">;
  readonly species: SpeciesSource;
  readonly profiles: CareProfileReader;
  readonly zones: Pick<ZoneStore, "list">;
}

/** The zone the catalog implies (FR-BES-10); "soft leaf" is not in the catalog, it is never assumed. */
function catalogZone(species: Species, zones: readonly LightZone[]): string | null {
  const d = zoneDerive(
    {
      lightDemandLux: species.lightDemandLux,
      standardLevel: species.standardLevel,
      softLeaf: false,
    },
    zones,
  );
  return d.kind === "zone" ? d.zone.id : null;
}

const deviation = (p: CareProfile | undefined) =>
  p !== undefined &&
  Object.entries(p).some(([field, value]) => field !== "speciesId" && value !== null);

export async function careProfileView(
  deps: CareProfileViewDependencies,
  userId: string,
): Promise<readonly CareProfileEntry[]> {
  const [specimens, profiles, zones] = await Promise.all([
    deps.specimens.list(userId),
    deps.profiles.list(userId),
    deps.zones.list(userId),
  ]);
  const active = specimens.filter(isActive);
  const own = new Map(profiles.map((p) => [p.speciesId, p] as const));
  const ids = [...new Set([...active.map((z) => z.speciesId), ...own.keys()])];
  const found = await Promise.all(ids.map((id) => deps.species.find(userId, id)));
  const entries = found.flatMap((species, i): CareProfileEntry[] => {
    const id = ids[i] as string;
    if (!species) return [];
    const profile = own.get(id) ?? null;
    return [
      {
        speciesId: id,
        speciesName: speciesDisplayName(species),
        activeSpecimens: active.filter((z) => z.speciesId === id).length,
        wateringHint: species.wateringHint,
        profile: effectiveProfile({ species, profile, catalogZoneId: catalogZone(species, zones) }),
        deviates: deviation(profile ?? undefined),
      },
    ];
  });
  return entries.sort((a, b) => a.speciesName.localeCompare(b.speciesName, "de"));
}
