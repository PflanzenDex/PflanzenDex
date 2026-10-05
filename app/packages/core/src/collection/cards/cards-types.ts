// Specimen cards (US-BES-06): what the card shows and which data it needs from other modules (ports).
import type { SpecimenStatus } from "../shared/types";

export const MEASUREMENT_QUALITIES = ["healthy", "etiolated"] as const;
export type MeasurementQuality = (typeof MEASUREMENT_QUALITIES)[number];

export interface LastMeasurement {
  /** Lokales Kalenderdatum `JJJJ-MM-TT` (NFR-08). */
  readonly date: string;
  /** In the unit of the species' growth measure (cm), as measured. */
  readonly value: number;
  readonly quality: MeasurementQuality;
  readonly note: string | null;
}

export interface CardMeasurementView {
  readonly last: LastMeasurement;
  /** Photo of the most recent measurement that has one; that can be an older one than the last measurement. */
  readonly photo: { readonly url: string; readonly date: string } | null;
}

/**
 * Port "Measurements per specimen" (US-BES-06): `care` (WAC) implements it. It names the last measurement and the most
 * recent photo per specimen; a specimen without a measurement is missing from the answer. Only specimens of the account
 * `userId` are asked for.
 */
export interface MeasurementSource {
  forSpecimens(
    userId: string,
    specimenIds: readonly string[],
  ): Promise<ReadonlyMap<string, CardMeasurementView>>;
}

export interface OpenTreatment {
  readonly id: string;
  readonly reason: string;
  /** Lokales Kalenderdatum `JJJJ-MM-TT`. */
  readonly dueAt: string;
}

/** Port "Open treatments per specimen" (US-BES-06): `care` (BEH) implements it; without an open treatment the entry is missing. */
export interface TreatmentSource {
  open(
    userId: string,
    specimenIds: readonly string[],
  ): Promise<ReadonlyMap<string, readonly OpenTreatment[]>>;
}

export interface DueDate {
  readonly kind: "overdue" | "today" | "soon";
  /** Amount in calendar days (0 for "today"). */
  readonly days: number;
  readonly text: string;
}

export interface SpecimenCard {
  readonly id: string;
  readonly name: string;
  /** The species of the specimen and its marker (US-BES-03); the form uses them to ask for missing markers. */
  readonly speciesId: string;
  readonly marker: string | null;
  /** Name of the species, `null` means "unknown" (P-08): the species is (no longer) visible for this account. */
  readonly speciesName: string | null;
  readonly status: SpecimenStatus;
  readonly location: string | null;
  /** Zone of the location (an override on the specimen only comes with BES-04); `null` = unknown. */
  readonly lightZone: string | null;
  readonly caughtAt: string | null;
  readonly photo: CardMeasurementView["photo"];
  /** `null` = no measurement yet. */
  readonly lastMeasurement: LastMeasurement | null;
  /** The open treatment that is due earliest, `null` without an open treatment. */
  readonly treatment: { readonly reason: string; readonly dueDate: DueDate } | null;
  readonly moreTreatments: number;
}
