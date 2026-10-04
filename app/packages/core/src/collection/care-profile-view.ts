// The care profile view (US-BES-09): per species with an active specimen, or with a deviation, the catalog value and
// my deviation side by side. Derived on every request, never stored (P-01).
import type { ZoneStore } from "../light";
import type { EffectiveProfile } from "./effective-profile";
import type { CareProfileReader } from "./care-profile-types";
import type { SpeciesSource, SpecimenStore } from "./types";

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

export async function careProfileView(
  deps: CareProfileViewDependencies,
  userId: string,
): Promise<readonly CareProfileEntry[]> {
  void deps;
  void userId;
  throw new Error("not implemented");
}
