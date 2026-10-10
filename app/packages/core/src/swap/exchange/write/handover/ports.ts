import type { OfferMode, OfferType } from "../../../offer";

/** What `confirm_handover()` answers: the state and what the collection work needs (ADR 0012, US-SOZ-11). */
export interface HandoverContext {
  readonly outcome: "ok" | "not_found" | "wrong_state" | "already_handed_over" | "friendship_ended";
  /** Both sides have confirmed: this confirmation completes the handover. */
  readonly both: boolean;
  readonly role: "giver" | "recipient" | null;
  readonly otherId: string | null;
  readonly offerId: string | null;
  /** The specimen offered (the giver's). */
  readonly specimenId: string | null;
  readonly type: OfferType | null;
  /** The marker the recipient chose for the new specimen. */
  readonly marker: string | null;
  readonly mode: OfferMode | null;
  /** The name of the other side as stored at the request; `null` = none (P-08). */
  readonly otherName: string | null;
}

/** A specimen as the handover reads it (a subset of `SpecimenRow` of `collection`). */
export interface HandoverSpecimen {
  readonly id: string;
  readonly speciesId: string;
  readonly name: string;
  readonly marker: string | null;
  readonly locationId: string | null;
  readonly status: "plant" | "cutting" | "archived";
  readonly caughtAt: string | null;
  readonly createdAt: string | null;
  readonly archivedAt: string | null;
  readonly archivedReason: string | null;
}

export type ReceiveRefusal = "name_taken" | "marker_taken" | "species_unknown";

/** The steps of a handover in one transaction (the adapter in `db`; a refused step rolls everything back). */
export interface HandoverSteps {
  confirm(swapId: string, marker: string | null): Promise<HandoverContext>;
  giverSpecimen(giver: string, specimenId: string): Promise<HandoverSpecimen | null>;
  recipientSpecimens(recipient: string): Promise<readonly HandoverSpecimen[]>;
  archiveGiven(
    giver: string,
    specimenId: string,
    reason: string,
    date: string,
  ): Promise<HandoverSpecimen>;
  createReceived(
    recipient: string,
    values: {
      readonly speciesId: string;
      readonly name: string;
      readonly marker: string | null;
      readonly locationId: string | null;
      readonly caughtAt: string | null;
      readonly status: "plant" | "cutting";
    },
    assignments: readonly { specimenId: string; name: string; marker: string }[],
  ): Promise<HandoverSpecimen>;
  finish(swapId: string, given: string, received: string): Promise<boolean>;
}

export interface HandoverStore {
  /** Runs `work` in one transaction as the caller; `commit: false` or a refused step rolls everything back. */
  handover<T>(
    userId: string,
    work: (steps: HandoverSteps) => Promise<{ readonly commit: boolean; readonly value: T }>,
  ): Promise<T | { readonly refused: ReceiveRefusal | "specimen_gone" }>;
}
