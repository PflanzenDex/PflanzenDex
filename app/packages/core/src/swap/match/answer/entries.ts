// The keeper's answers as entries of the lists "Später" and "Abgelehnt" (US-TAU-06): each answer with the state of its
// offer, derived on every read (NFR-04). Private to the keeper (FR-TAU-02).
import type { ExchangeOffer } from "../../exchange";
import type { MatchCard } from "../deck";
import type { StoredMatchAnswer } from "./types";

/**
 * What became of an answered offer (US-TAU-06), derived on every read (NFR-04): `open` it is still a card, `requested`
 * the keeper has asked for it already, `wish_done` the wish is no longer on the wishlist (US-WUN-03), `unavailable` the
 * offer ended (withdrawn, given to someone else or the friendship ended) or is not shared any more.
 */
export type EntryState = "open" | "requested" | "wish_done" | "unavailable";

/** One answer of the keeper to an offer, for the lists "Später" and "Abgelehnt" (US-TAU-06). Private (FR-TAU-02). */
export interface MatchEntry {
  readonly offerId: string;
  readonly answer: "no" | "later";
  /** Local calendar date `YYYY-MM-DD` of the keeper (NFR-08). */
  readonly answeredOn: string;
  readonly speciesLatin: string | null;
  readonly speciesGerman: string | null;
  readonly giverName: string | null;
  readonly state: EntryState;
  /** The card while the entry is `open`, so a Later entry can be decided now. */
  readonly card: MatchCard | null;
}

function stateOf(offer: ExchangeOffer | undefined, card: MatchCard | null): EntryState {
  if (!offer) return "unavailable";
  if (!card) return "wish_done";
  return offer.requested ? "requested" : "open";
}

/** The entry of one stored answer; the live offer wins over the copied names, which only serve when the offer is gone. */
export function entryOf(
  a: StoredMatchAnswer,
  offer: ExchangeOffer | undefined,
  card: MatchCard | null,
): MatchEntry {
  const state = stateOf(offer, card);
  return {
    offerId: a.offerId,
    answer: a.answer,
    answeredOn: a.answeredOn,
    speciesLatin: offer?.speciesLatin ?? a.speciesLatin,
    speciesGerman: offer?.speciesGerman ?? a.speciesGerman,
    giverName: offer?.ownerName ?? a.giverName,
    state,
    card: state === "open" ? card : null,
  };
}
