import type { SharingStore } from "../../social";
import type { TreatmentStore } from "../../care";

export const OFFER_TYPES = ["cutting", "plant", "offshoot"] as const;
export type OfferType = (typeof OFFER_TYPES)[number];
export const OFFER_MODES = ["swap", "give_away"] as const;
export type OfferMode = (typeof OFFER_MODES)[number];
export type OfferStatus = "open" | "reserved" | "handed_over" | "withdrawn";

/** Limits are assumptions (starting values); the database checks the same values. */
export const OFFER_LIMITS = { wish: { min: 1, max: 200 }, note: { min: 1, max: 500 } } as const;

/** What is stored (DM-SOZ-02). Health and phase are derived on every read and have no fields here (P-01). */
export interface OfferRow {
  readonly id: string;
  readonly specimenId: string;
  readonly type: OfferType;
  readonly mode: OfferMode;
  readonly wish: string | null;
  readonly note: string | null;
  readonly status: OfferStatus;
  /** UTC instant (ISO 8601). */
  readonly createdAt: string;
}

export type OfferValues = Pick<OfferRow, "specimenId" | "type" | "mode" | "wish" | "note">;

/** Port for persistence; the adapter lives in `db` and runs as the account of the caller (AB-1, P-04). */
export interface OfferStore {
  /** `"already_open"` when the specimen has an open or reserved offer already (the database holds the rule). */
  create(userId: string, values: OfferValues): Promise<OfferRow | "already_open">;
  find(userId: string, id: string): Promise<OfferRow | null>;
  /** The caller's own offers, newest first. */
  list(userId: string): Promise<readonly OfferRow[]>;
  /** Withdraws an open or reserved offer; withdrawing twice returns the withdrawn offer, a handed-over one is `"not_active"`. */
  withdraw(userId: string, id: string): Promise<OfferRow | "not_found" | "not_active">;
}

/** The part of a specimen offers need; a subset of `SpecimenStore` of `collection`, wired in the app root. */
export interface OwnSpecimen {
  readonly id: string;
  readonly name: string;
  readonly speciesId: string;
  readonly status: "plant" | "cutting" | "archived";
}
export interface OwnSpecimens {
  find(userId: string, id: string): Promise<OwnSpecimen | null>;
}

/** Port: the care phase of one specimen today, `null` = no phase (cutting, species without dormancy period). */
export interface PhaseHints {
  phaseOf(
    userId: string,
    specimenId: string,
    timeZone: string,
  ): Promise<"growth" | "dormancy" | null>;
}

/** What an offer needs from the neighbouring modules (ADR 0012: `swap` depends on `social`, `collection`, `care`). */
export interface OfferDependencies {
  readonly offers: OfferStore;
  readonly specimens: OwnSpecimens;
  /** The keeper's own sharing settings: an offer needs `Share = friends`. */
  readonly sharing: Pick<SharingStore, "list">;
  readonly treatments: Pick<TreatmentStore, "open" | "done">;
  readonly phases: PhaseHints;
}

/**
 * Health details of an offered specimen, derived from its treatments (US-SOZ-08): "treatment open" or "last treated:
 * reason, date". Never the agent and never a note. `lastTreated` is `null` when nothing was treated (unknown is not "healthy", P-08).
 */
export interface OfferHealth {
  readonly treatmentOpen: boolean;
  readonly lastTreated: { readonly reason: string; readonly doneAt: string } | null;
}

/** A static notice on plant law (FR-SOZ-09): no block, no legal review, no list of species that could be wrong. */
export const SPECIES_PROTECTION_NOTICE =
  "Manche Arten sind geschützt (zum Beispiel viele Kakteen und Orchideen nach CITES). Prüfe vor dem Anbieten, ob für diese Art Handelsbeschränkungen gelten. Das ist ein Hinweis, keine Rechtsberatung; ein Versand über Landesgrenzen gehört nicht zu PflanzenDex.";
