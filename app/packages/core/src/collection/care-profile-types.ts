// The keeper's own care profile per species (US-BES-09, DM-BES-04, FR-BES-09). Ports for persistence; the adapter
// lives in `db` (AB-1). The profile is private to the account (P-05) and never part of a sharing setting (US-SOZ-04).

/** Limits are assumptions (starting values); the database checks the same values. */
export const CARE_PROFILE_LIMITS = {
  wateringDays: { min: 1, max: 365 },
  ownHints: { min: 1, max: 1000 },
} as const;

/**
 * What the keeper deviates in, per species. `null` means "no deviation": the catalog value applies (FR-BES-09). The
 * catalog itself is never changed. Only these fields can be overridden; names, taxonomy, growth measure, etiolation
 * signs, success criteria, story, image, attributes and difficulty live in the catalog only.
 */
export interface CareProfile {
  readonly speciesId: string;
  /** A location of the account, selected and never typed (FR-PHA-03). */
  readonly growthLocationId: string | null;
  readonly dormancyLocationId: string | null;
  /** A light zone of the account; without it the derived zone applies (FR-BES-10). */
  readonly lightZoneId: string | null;
  /** Month-day `MM-DD`, both or none; may span the turn of the year. */
  readonly dormancyFrom: string | null;
  readonly dormancyUntil: string | null;
  /** Days between waterings (US-MON-05 uses them). */
  readonly wateringGrowthDays: number | null;
  readonly wateringDormancyDays: number | null;
  readonly ownHints: string | null;
}

export type OverridableField = Exclude<keyof CareProfile, "speciesId">;

export const OVERRIDABLE_FIELDS = [
  "growthLocationId",
  "dormancyLocationId",
  "lightZoneId",
  "dormancyFrom",
  "dormancyUntil",
  "wateringGrowthDays",
  "wateringDormancyDays",
  "ownHints",
] as const satisfies readonly OverridableField[];

/** A field that is present is set; `null` resets it to the catalog; an absent field stays as it is. */
export type CareProfileChanges = { readonly [F in OverridableField]?: CareProfile[F] };

/** Every call applies to the account `userId` only (P-04). */
export interface CareProfileStore {
  /** All care profiles of the account; an account without deviations has none. */
  list(userId: string): Promise<readonly CareProfile[]>;
  /**
   * Applies the changes to the profile of the species (created on first use) in one statement; fields that are not
   * named stay as they are. A location or zone of another account is refused and nothing is written.
   */
  update(
    userId: string,
    speciesId: string,
    changes: CareProfileChanges,
  ): Promise<CareProfile | "location_unknown" | "zone_unknown">;
}

/** Reading side only; the care phases read the profile through it. */
export type CareProfileReader = Pick<CareProfileStore, "list">;
