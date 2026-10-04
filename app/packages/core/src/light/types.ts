// Locations and light zones (US-LIC-05). Ports for persistence; adapters live in `db` (AB-1).

export const LOCATION_KINDS = ["indoor", "outdoor"] as const;
export type LocationKind = (typeof LOCATION_KINDS)[number];

/** Limits are assumptions (starting values): sunlight is about 100,000 to 130,000 lux, 2,000 µmol/m²/s PPFD. */
export const LIMITS = {
  name: { min: 1, max: 60 },
  luxCeiling: { min: 1, max: 200_000 },
  ppfd: { min: 1, max: 3_000 },
  sortOrder: { min: 0, max: 999 },
} as const;

export interface LightZone {
  readonly id: string;
  readonly name: string;
  readonly luxCeiling: number;
  readonly ppfd: number | null;
  readonly sortOrder: number;
}

/** `order: null` appends the zone to the end of the existing ones. */
export interface ZoneValues {
  readonly name: string;
  readonly luxCeiling: number;
  readonly ppfd: number | null;
  readonly sortOrder: number | null;
}

export interface LightLocation {
  readonly id: string;
  readonly name: string;
  readonly lightZoneId: string | null;
  readonly kind: LocationKind;
}

export interface LocationValues {
  readonly name: string;
  readonly lightZoneId: string | null;
  readonly kind: LocationKind;
}

/** Every call applies only to the account `userId` (P-04); names are unique per account. */
export interface ZoneStore {
  list(userId: string): Promise<readonly LightZone[]>;
  create(userId: string, values: ZoneValues): Promise<LightZone | "name_taken">;
  update(
    userId: string,
    id: string,
    values: ZoneValues,
  ): Promise<LightZone | "name_taken" | "not_found">;
  /** The adapter also reports `in_use` as a fallback (foreign key) in case a usage newly arose. */
  remove(userId: string, id: string): Promise<"deleted" | "not_found" | "in_use">;
}

export interface LightLocationStore {
  list(userId: string): Promise<readonly LightLocation[]>;
  create(
    userId: string,
    values: LocationValues,
  ): Promise<LightLocation | "name_taken" | "zone_unknown">;
  update(
    userId: string,
    id: string,
    values: LocationValues,
  ): Promise<LightLocation | "name_taken" | "not_found" | "zone_unknown">;
}

export type ZoneUserKind = "location" | "specimen" | "species" | "care_profile" | "wish";

export interface ZoneUser {
  readonly kind: ZoneUserKind;
  readonly id: string;
  readonly name: string;
}

/**
 * Port "zone usage": each source names who occupies a zone. Locations are supplied by `db`. Species and specimens
 * do not link a zone (yet); as soon as a field of the `collection` module points to a zone (BES-04, BES-09),
 * `collection` implements this port for its table, otherwise the usage would go unnoticed on delete.
 */
export interface ZoneUsage {
  user(userId: string, lightZoneId: string): Promise<readonly ZoneUser[]>;
}
