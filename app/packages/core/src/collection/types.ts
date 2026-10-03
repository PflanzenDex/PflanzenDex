// Specimens (US-BES-02, DM-BES-02). Ports for persistence and target location; adapters live in `db` and `care` (AB-1).
import type { Species } from "../catalog";

export const SPECIMEN_STATUS = ["plant", "cutting", "archived"] as const;
export type SpecimenStatus = (typeof SPECIMEN_STATUS)[number];

/** Limits are assumptions (starting values); the database checks the same values. */
export const SPECIMEN_LIMITS = {
  marker: { min: 1, max: 40 },
  name: { min: 1, max: 250 },
  archivedReason: { min: 1, max: 250 },
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
  /** Local calendar date of the archiving (NFR-08); `null` as long as the specimen is not archived (US-BES-07). */
  readonly archivedAt: string | null;
  /** Reason of the archiving (`received`, `given_away`, … or free); `null` as long as not archived. */
  readonly archivedReason: string | null;
}

/** Archived specimens are missing from all lists and evaluations (US-BES-07); every evaluation filters with this. */
export const isActive = (row: Pick<SpecimenRow, "status">): boolean => row.status !== "archived";

/** The reasons the UI offers; any other text is equally valid (free, US-BES-07). */
export const ARCHIVED_REASONS = [
  "eingegangen",
  "abgegeben",
  "getauscht",
  "verschenkt",
  "verkauft",
] as const;

/** A specimen with the derived lists. Both are empty until WAC and BEH supply data (never stored). */
export interface Specimen extends SpecimenRow {
  readonly measurements: readonly never[];
  readonly treatments: readonly never[];
}

/** At creation only these two statuses are possible; without a value `plant` applies (US-BES-04). */
export const CREATE_STATUS = ["plant", "cutting"] as const;
export type CreateStatus = (typeof CREATE_STATUS)[number];

export type SpecimenValues = Pick<
  SpecimenRow,
  "speciesId" | "name" | "marker" | "locationId" | "caughtAt"
> & { readonly status?: CreateStatus };

/**
 * An existing specimen that receives its marker together with a new one (US-BES-03: from the third specimen on every
 * specimen has a marker). `name` is the new name per DM-BES-03.
 */
export interface MarkerAssignment {
  readonly specimenId: string;
  readonly name: string;
  readonly marker: string;
}

/** Every call applies only to the account `userId` (P-04). The name is unique per account (case-insensitive). */
export interface SpecimenStore {
  list(userId: string): Promise<readonly SpecimenRow[]>;
  find(userId: string, id: string): Promise<SpecimenRow | null>;
  /**
   * All or nothing; with a taken name, a taken marker (per species, case-insensitive), a foreign location or an
   * unknown specimen in `assignments` nothing is written (FR-BES-03, US-BES-03). The `assignments` are written in
   * the same transaction as the new specimen.
   */
  create(
    userId: string,
    values: SpecimenValues,
    assignments?: readonly MarkerAssignment[],
  ): Promise<SpecimenRow | "name_taken" | "marker_taken" | "location_unknown" | "specimen_unknown">;
  /**
   * Sets marker and name of one specimen in one statement (US-BES-03); the ID and everything else stay. An archived
   * specimen stays unchanged (its name stays taken, US-BES-07); a taken marker or name changes nothing.
   */
  mark(
    userId: string,
    id: string,
    values: { readonly name: string; readonly marker: string },
  ): Promise<SpecimenRow | "not_found" | "archived" | "name_taken" | "marker_taken">;
  /**
   * Sets status, date and reason in one statement (US-BES-07). An already archived specimen stays unchanged, so that
   * date and reason of the first archiving are not overwritten (P-10).
   */
  archive(
    userId: string,
    id: string,
    reason: string,
    date: string,
  ): Promise<SpecimenRow | "not_found" | "already_archived">;
  /** A cutting becomes a plant (US-BES-04); any other specimen stays unchanged and reports `not_a_cutting`. */
  repot(userId: string, id: string): Promise<SpecimenRow | "not_found" | "not_a_cutting">;
  /** Restores the status from before the archiving and deletes date and reason (US-BES-07). */
  restore(userId: string, id: string): Promise<SpecimenRow | "not_found" | "not_archived">;
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
  /**
   * Location of the growth phase, even when the species is in dormancy today (US-BES-04: this is where a cutting
   * stands), or `null` for "unknown".
   */
  growthLocation(userId: string, species: Species): Promise<string | null>;
}
