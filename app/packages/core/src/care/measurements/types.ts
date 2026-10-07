// Measurements (US-WAC-01, DM-WAC-01). Ports for persistence; adapters live in `db` (AB-1).
import type { GrowthMeasure } from "../../catalog";
import type { GrowthTrend } from "./growth";

export const QUALITIES = ["healthy", "etiolated"] as const;
/** `etiolated` is "etiolated/thin" (US-WAC-02); etiolation never counts as success (US-WAC-04). */
export type Quality = (typeof QUALITIES)[number];

export const RATED_BY = ["keeper", "ai_adopted"] as const;
export type RatedBy = (typeof RATED_BY)[number];

/** Limits are assumptions (starting values); the database checks the same values. The step 0.5 is in US-WAC-01. */
export const MEASUREMENT_LIMITS = {
  value: { min: 0, max: 10_000 },
  step: 0.5,
  note: { min: 1, max: 1000 },
} as const;

/** What is stored. Rate, trend and rating of the course are derived and do not belong here (P-01). */
export interface MeasurementRow {
  readonly id: string;
  readonly specimenId: string;
  /** Lokales Kalenderdatum `JJJJ-MM-TT` (NFR-08). */
  readonly date: string;
  /** In the unit of the species' growth measure (cm). */
  readonly value: number;
  readonly quality: Quality;
  readonly note: string | null;
  readonly ratedBy: RatedBy;
  /** Object name of the processed photo (US-WAC-06, FR-WAC-09); `null` means no photo. */
  readonly photo: string | null;
}

/** A new measurement has no photo yet; the photo is attached by `measurement.photo` (US-WAC-06). */
export type MeasurementValues = Omit<MeasurementRow, "id" | "photo">;

/** Every call applies to the account `userId` only (P-04). */
export interface MeasurementStore {
  /** All measurements of the specimen, newest first (date, with the same date the one recorded last). */
  list(userId: string, specimenId: string): Promise<readonly MeasurementRow[]>;
  /**
   * The last measurement of each named specimen of the account (latest date, with the same date the one recorded
   * last); specimens without a measurement or of another account are missing from the answer.
   */
  lastFor(
    userId: string,
    specimenIds: readonly string[],
  ): Promise<ReadonlyMap<string, MeasurementRow>>;
  /**
   * The most recent measurement that has a photo, per named specimen of the account (latest date, with the same date
   * the one recorded last); specimens without a photo are missing from the answer.
   */
  lastPhotoFor(
    userId: string,
    specimenIds: readonly string[],
  ): Promise<ReadonlyMap<string, { readonly id: string; readonly date: string }>>;
  /** The measurement of the specimen on that local date; with several the one recorded last (FR-WAC-07), else `null`. */
  findOnDate(userId: string, specimenId: string, date: string): Promise<MeasurementRow | null>;
  /** Sets the photo name; `false` if the measurement is gone or not the account's (nothing written, P-04). */
  setPhoto(userId: string, measurementId: string, photo: string): Promise<boolean>;
  /** All or nothing; a specimen of another account counts as unknown and writes nothing. */
  create(userId: string, values: MeasurementValues): Promise<MeasurementRow | "specimen_unknown">;
}

/** The "Measure" view of a specimen (US-WAC-01). Rate and trend follow with US-WAC-03. */
export interface MeasurementView {
  readonly specimenId: string;
  /** What is measured: the growth measure of the species; `null` means "unknown" (P-08). */
  readonly growthMeasure: GrowthMeasure | null;
  /**
   * How to recognize etiolation on this species (catalog field, US-WAC-02), shown at the quality choice; `null` if the
   * species is not visible or the text is empty, never invented (P-08).
   */
  readonly etiolationSigns: string | null;
  readonly measurements: readonly MeasurementRow[];
  readonly last: MeasurementRow | null;
  /** Quality of the last measurement; `null` as long as there is none. */
  readonly lastRating: Quality | null;
  /** Rate and trend against the own history (US-WAC-03); derived, never stored (P-01). */
  readonly growth: GrowthTrend;
}
