// Distribution of the specimens over the light zones (US-LIC-02, FR-LIC-04): shapes of the derived view.
import type { LightLocationStore, LightZone, ZoneStore } from "../light";
import type { CareProfileReader } from "./care-profile-types";
import type { SpeciesSource, SpecimenStore } from "./types";

export interface ZoneCount {
  readonly zone: LightZone;
  readonly count: number;
}

/** What does not go into the count is named anyway (P-10); zones that cannot be derived are called "unknown" (P-08). */
export interface NotCounted {
  readonly cuttingLight: number;
  readonly archived: number;
  readonly zoneUnknown: number;
}

export interface DistributionHint {
  readonly text: string;
  readonly nextAction: string;
}

export interface Distribution {
  /** Zones 2 to 4 (all except cutting light) in the order of the account, also with count 0. */
  readonly zones: readonly ZoneCount[];
  /** All zones with the smallest count (several with a tie); empty as long as nothing is counted. */
  readonly thinnest: readonly LightZone[];
  readonly notCounted: NotCounted;
  readonly hint: DistributionHint;
}

/** Reading ports; every call applies to the account only (P-04). */
export interface DistributionDependencies {
  readonly specimens: SpecimenStore;
  readonly species: SpeciesSource;
  readonly locations: LightLocationStore;
  readonly zones: ZoneStore;
  /** My zone override per species (US-BES-09); without it the derived zone of the catalog applies. */
  readonly profiles?: CareProfileReader;
}
