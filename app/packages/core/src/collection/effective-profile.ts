// The effective care profile (FR-BES-09): specimen before care profile before catalog. Pure, derived on every request
// and never stored (P-01). A value nobody knows stays unknown, it is never invented (P-08).
import type { Species } from "../catalog";
import type { CareProfile, CareProfileChanges } from "./care-profile-types";

export type ValueSource = "specimen" | "profile" | "catalog" | "unknown";

/** One field with the value of each layer side by side (US-BES-09: the catalog value and my deviation). */
export interface Layered<T> {
  /** What the catalog says; `null` = the catalog has no value ("unbekannt"). */
  readonly catalog: T | null;
  /** My deviation; `null` = none, the catalog applies. */
  readonly own: T | null;
  /** What applies, and which layer says so. */
  readonly effective: T | null;
  readonly source: ValueSource;
}

export interface Dormancy {
  readonly from: string;
  readonly until: string;
}

export interface EffectiveProfile {
  readonly growthLocation: Layered<string>;
  readonly dormancyLocation: Layered<string>;
  readonly lightZone: Layered<string>;
  readonly dormancy: Layered<Dormancy>;
  readonly wateringGrowthDays: Layered<number>;
  readonly wateringDormancyDays: Layered<number>;
  readonly ownHints: Layered<string>;
}

export interface EffectiveInput {
  readonly species: Pick<Species, "dormancyFrom" | "dormancyUntil">;
  /** The care profile of the account for this species; `null` = none, which is valid. */
  readonly profile: CareProfile | null;
  /** Values of the specimen itself (strongest layer); no field of a specimen overrides one yet. */
  readonly specimen?: CareProfileChanges;
  /** The zone the catalog implies for this account (FR-BES-10, derived from the lux need); `null` = unknown. */
  readonly catalogZoneId: string | null;
}

export function effectiveProfile(input: EffectiveInput): EffectiveProfile {
  void input;
  throw new Error("not implemented");
}

/** The dormancy period that applies (override, else catalog), or `null` when nobody knows one. */
export function effectiveDormancy(
  species: Pick<Species, "dormancyFrom" | "dormancyUntil">,
  profile: CareProfile | null,
): Dormancy | null {
  void species;
  void profile;
  throw new Error("not implemented");
}
