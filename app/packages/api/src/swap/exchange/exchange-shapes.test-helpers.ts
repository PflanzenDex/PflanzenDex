import type { KeyShape } from "../../exact-keys-test-helpers";

// US-QG-05 QG-D2: the whitelisted fields of an open offer of a friend (US-SOZ-09, US-SOZ-08) and of a match card (US-TAU-01,
// US-TAU-04, US-TAU-05). Health shows reason and date only, never agent or note (P-05). The giver's account id is not on
// either list: the friend is named by the display name the keeper stored.
export const EXCHANGE_OFFER: KeyShape = {
  ownerName: true,
  offerId: true,
  specimenId: true,
  type: true,
  mode: true,
  wish: true,
  note: true,
  offeredAt: true,
  photosShared: true,
  specimenName: true,
  speciesLatin: true,
  speciesGerman: true,
  health: { treatmentOpen: true, lastTreated: { reason: true, doneAt: true } },
  phase: true,
  lack: true,
  onWishlist: true,
  requested: true,
};

/** A match card: the offer plus its reasons (checked per kind, see `MATCH_REASONS`). */
export const MATCH_CARD: KeyShape = { ...EXCHANGE_OFFER, reasons: true };

/** The reasons of a card by kind: the own wish, and "fits both ways" (US-TAU-05). */
export const MATCH_REASONS = {
  wishlist: { kind: true, species: true, reasoning: true },
  both_ways: {
    kind: true,
    giverName: true,
    offerId: true,
    specimenId: true,
    speciesLatin: true,
    speciesGerman: true,
  },
} as const satisfies Record<string, KeyShape>;

/** One answer of the keeper to an offer, for the lists "Später" and "Abgelehnt" (US-TAU-06). */
export const MATCH_ENTRY: KeyShape = {
  offerId: true,
  answer: true,
  answeredOn: true,
  speciesLatin: true,
  speciesGerman: true,
  giverName: true,
  state: true,
  card: MATCH_CARD,
};
