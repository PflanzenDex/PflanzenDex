// Specimens (US-BES-02, DM-BES-02). Ports for persistence and target location; adapters live in `db` and `care` (AB-1).
import type { Species } from "../catalog";

export const SPECIMEN_STATUS = ["plant", "cutting", "archived"] as const;
export type SpecimenStatus = (typeof SPECIMEN_STATUS)[number];

/** Limits are assumptions (starting values); the database checks the same values. */
export const SPECIMEN_LIMITS = {
  marker: { min: 1, max: 40 },
  name: { min: 1, max: 250 },
} as const;

/** What gets stored. Measurements and treatment list are derived and do not belong here (P-01). */
export interface SpecimenRow {
  readonly id: string;
  readonly speciesId: string;
  readonly name: string;
  readonly marker: string | null;
  /** `null` means "unknown" (P-08): no target location known and none chosen. */
  readonly locationId: string | null;
  readonly status: SpecimenStatus;
  /** Lokales Kalenderdatum `JJJJ-MM-TT` (NFR-08). */
  readonly caughtAt: string | null;
}

/** A specimen with the derived lists. Both are empty until WAC and BEH supply data (never stored). */
export interface Specimen extends SpecimenRow {
  readonly measurements: readonly never[];
  readonly treatments: readonly never[];
}

export type SpecimenValues = Pick<
  SpecimenRow,
  "speciesId" | "name" | "marker" | "locationId" | "caughtAt"
>;

/** Every call applies only to the account `userId` (P-04). The name is unique per account (case-insensitive). */
export interface SpecimenStore {
  list(userId: string): Promise<readonly SpecimenRow[]>;
  find(userId: string, id: string): Promise<SpecimenRow | null>;
  /** All or nothing; with a taken name or a foreign location nothing is written (FR-BES-03). */
  create(
    userId: string,
    values: SpecimenValues,
  ): Promise<SpecimenRow | "name_taken" | "location_unknown">;
}

/** Only reading a visible species; `SpeciesStore` from `catalog` fulfils the port. */
export interface SpeciesSource {
  find(userId: string, id: string): Promise<Species | null>;
}

/**
 * Port "target location" (US-BES-02, FR-PHA-05): the id of the location a new specimen of this species
 * belongs to today (growth phase; in dormancy the dormancy location, if there is one), or `null` for "unknown".
 * `today` is the user's local date. The lower module `collection` defines the port, `care` (PHA) implements it.
 */
export interface TargetLocationSource {
  targetLocation(userId: string, species: Species, today: string): Promise<string | null>;
}
