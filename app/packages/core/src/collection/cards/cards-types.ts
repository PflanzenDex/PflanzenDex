// Specimen cards (US-BES-06): what the card shows and which data it needs from other modules (ports).
import type { ZoneSource } from "../placement/effective-zone";
import type { SpecimenRow, SpecimenStatus } from "../shared/types";

export const MEASUREMENT_QUALITIES = ["healthy", "etiolated"] as const;
export type MeasurementQuality = (typeof MEASUREMENT_QUALITIES)[number];

export interface LastMeasurement {
  /** Local calendar date `YYYY-MM-DD` (NFR-08). */
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
  /** Local calendar date `YYYY-MM-DD`. */
  readonly dueAt: string;
}

/** Port "Open treatments per specimen" (US-BES-06): `care` (BEH) implements it; without an open treatment the entry is missing. */
export interface TreatmentSource {
  open(
    userId: string,
    specimenIds: readonly string[],
  ): Promise<ReadonlyMap<string, readonly OpenTreatment[]>>;
}

/** Where a received specimen came from (US-SOZ-13): the giver's display name as stored at the request and the handover date. */
export interface SpecimenProvenance {
  /** `null` = the giver has no display name (P-08). */
  readonly from: string | null;
  /** UTC instant or local date of the handover (ISO 8601). */
  readonly date: string;
}

/**
 * Port "SpecimenProvenance per specimen" (US-SOZ-13): `swap` implements it. A specimen that was received in a swap is in the
 * answer, every other one is missing. Only specimens of the account `userId` are asked for.
 */
export interface ProvenanceSource {
  forSpecimens(
    userId: string,
    specimenIds: readonly string[],
  ): Promise<ReadonlyMap<string, SpecimenProvenance>>;
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
  /** Effective zone, the same one the distribution counts (FR-LIC-02); `null` = unknown. */
  readonly lightZone: string | null;
  /** Where the zone comes from; `null` when the zone is unknown. */
  readonly lightZoneSource: ZoneSource | null;
  /** No zone at all and the lux need or default level of the species is unknown: "Lichtbedarf eintragen" (US-LIC-01). */
  readonly lightNeedUnknown: boolean;
  readonly caughtAt: string | null;
  /** From whom the specimen was received in a swap; `null` for a specimen that is the keeper's own (US-SOZ-13). */
  readonly provenance: SpecimenProvenance | null;
  readonly photo: CardMeasurementView["photo"];
  /** `null` = no measurement yet. */
  readonly lastMeasurement: LastMeasurement | null;
  /** The open treatment that is due earliest, `null` without an open treatment. */
  readonly treatment: { readonly reason: string; readonly dueDate: DueDate } | null;
  readonly moreTreatments: number;
}

/**
 * Port "Measured plants" (US-BES-06 summary): `care` (WAC) implements it. The IDs of the specimens of the account that
 * have at least one measurement, as one aggregate; archived ones included (the caller checks activity, `SpecimenPageSource.anyActive`).
 */
export interface MeasuredSource {
  measuredSpecimenIds(userId: string): Promise<readonly string[]>;
}

/**
 * The cursor of the card list (US-BES-06, FR-BES-23): the sort key of the last card of a page (its name) and its ID. The
 * client takes it as opaque text (`encodeCardCursor`), so the next page starts after exactly that row.
 */
export interface CardCursor {
  readonly name: string;
  readonly id: string;
}

/**
 * One page of the card list. `location`: a location ID, `"none"` for plants without a location, `null` for all; `species`:
 * a species ID or `null`. `limit` is at least 1 (`parseCardPageQuery` checks it).
 */
export interface CardPageQuery {
  readonly limit: number;
  readonly after: CardCursor | null;
  readonly location: string | "none" | null;
  readonly species: string | null;
}

/** The answer of the page read: `more` tells whether a card follows the page, `total` counts the whole filter. */
export interface SpecimenPage {
  readonly rows: readonly SpecimenRow[];
  readonly more: boolean;
  readonly total: number;
}

/** The counts of the database over all active specimens (US-BES-06 summary): plain IDs, the names are resolved by `core`. */
export interface SpecimenCountRows {
  readonly total: number;
  /** Number of active plants without a location. */
  readonly unplaced: number;
  readonly groups: readonly { readonly locationId: string; readonly count: number }[];
  /** Location of the plant with the latest catch date that has one; `null` without such a plant. */
  readonly lastLocationId: string | null;
}

/** One location of the summary with its number of active plants (US-BES-06 "Nach Standort"); `location` is `null` when the name is unknown (P-08). */
export interface LocationGroup {
  readonly locationId: string;
  readonly location: string | null;
  readonly count: number;
}

export interface SpecimenSummary {
  readonly total: number;
  /** Number of active plants without a location; the group "Standort unbekannt" shows it (US-BES-06). */
  readonly unplaced: number;
  readonly groups: readonly LocationGroup[];
  /** Name of the last location (see `SpecimenCountRows.lastLocationId`); `null` without such a plant. */
  readonly lastLocation: string | null;
  /** Some active plant is measured (US-BES-06); without a measurement port no plant counts as measured (P-08). */
  readonly anyMeasured: boolean;
}

/** An active specimen for the treatment form (US-BEH-01): cuttings included; `location` is `null` when unknown (P-08). */
export interface TreatableSpecimen {
  readonly id: string;
  readonly name: string;
  readonly location: string | null;
}

/** The rows of the treatment list as the database answers them: the location by ID; `core` resolves the name. */
export interface TreatableRow {
  readonly id: string;
  readonly name: string;
  readonly locationId: string | null;
}

/**
 * Port "Card list reads" (US-BES-06, FR-BES-23): the database answers one page of active specimens with the total of its
 * filter, the counts of the summary, whether any of given specimens is active, and the slim list of the treatment form.
 * Only specimens of the account `userId` are read.
 */
export interface SpecimenPageSource {
  page(userId: string, query: CardPageQuery): Promise<SpecimenPage>;
  summary(userId: string): Promise<SpecimenCountRows>;
  anyActive(userId: string, specimenIds: readonly string[]): Promise<boolean>;
  treatable(userId: string): Promise<readonly TreatableRow[]>;
}

export interface CardPage {
  readonly cards: readonly SpecimenCard[];
  readonly total: number;
  /** Opaque cursor of the next page; `null` on the last page. */
  readonly next: string | null;
}
