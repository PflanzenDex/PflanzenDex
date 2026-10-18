import { isTimeZone, localToday, ok, type Result, failed, appError } from "../../kernel";
import { exchangeList, type ExchangeQuery } from "../exchange";
import type { ExchangeDependencies, ExchangeOffer } from "../exchange";
import type { MatchAnswers, StoredMatchAnswer } from "./answer/types";

/** The verifiable fact why a card appears (US-TAU-04): the wish and the species it names, nothing more (P-08). */
export interface FitReason {
  readonly kind: "wishlist";
  /** The Latin name of the species; the wish is named by it. */
  readonly species: string;
}

/** A match card (US-TAU-01): an open offer of a friend plus the reasons it is shown. No score, no percentage (FR-TAU-06). */
export interface MatchCard extends ExchangeOffer {
  readonly reasons: readonly FitReason[];
}

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

/** Days a "Later" card stays out of the deck (starting value 1 day, assumption of the PO). */
export const LATER_DAYS = 1;

const compare = (a: string | null, b: string | null) => (a ?? "").localeCompare(b ?? "", "de");

/**
 * Fixed order (FR-TAU-05): oldest open offer first, then giver name, then species, then offer id as the last tie
 * break. It contains no ranking (FR-TAU-06).
 */
export function deckOrder(a: MatchCard, b: MatchCard): number {
  return (
    Date.parse(a.offeredAt) - Date.parse(b.offeredAt) ||
    compare(a.ownerName, b.ownerName) ||
    compare(a.speciesLatin, b.speciesLatin) ||
    compare(a.offerId, b.offerId)
  );
}

/** What the deck needs besides the exchange: the private answers and the clock (NFR-08). */
export interface MatchContext {
  readonly answers: MatchAnswers;
  readonly clock: () => Date;
}

/**
 * The match deck (US-TAU-01): the exchange list narrowed to offers whose species is on the caller's own wishlist.
 * It reuses the exchange read, so only open offers of confirmed friends with `Share = friends` can appear and the
 * wishlist is only asked per species (P-05, FR-WUN-07, FR-TAU-02). The match is the exact species and nothing else
 * (FR-TAU-04); an offer of an unknown species never matches. What the caller answered is derived on every read
 * (NFR-04, US-TAU-02, US-TAU-06): `cards` are the offers without an answer plus those answered with Later on an earlier
 * day (they come back after a day, starting value); an offer answered with No stays out until the keeper reconsiders it.
 * `entries` lists every answer with its state, so Later and No stay findable and an ended offer is marked, never dropped
 * silently (P-10); only the keeper removes an entry.
 */
export async function matchDeck(
  deps: ExchangeDependencies,
  context: MatchContext,
  userId: string,
  query: Pick<ExchangeQuery, "timeZone">,
): Promise<
  Result<{ readonly cards: readonly MatchCard[]; readonly entries: readonly MatchEntry[] }>
> {
  if (!isTimeZone(query.timeZone))
    return failed(
      appError("input.invalid", { details: [{ field: "timeZone", code: "input.invalid" }] }),
    );
  const list = await exchangeList(deps, userId, { timeZone: query.timeZone });
  if (!list.ok) return list;
  const today = localToday(context.clock(), query.timeZone);
  const given = new Map((await context.answers.list(userId)).map((a) => [a.offerId, a]));
  const matching = list.value.offers
    .flatMap((o): MatchCard[] =>
      o.onWishlist && o.speciesLatin !== null
        ? [{ ...o, reasons: [{ kind: "wishlist", species: o.speciesLatin }] }]
        : [],
    )
    .sort(deckOrder);
  const cards = matching.filter((c) => {
    const a = given.get(c.offerId);
    return !a || (a.answer === "later" && daysBefore(a.answeredOn, today) >= LATER_DAYS);
  });
  const byId = new Map(list.value.offers.map((o) => [o.offerId, o]));
  const cardById = new Map(matching.map((c) => [c.offerId, c]));
  const entries = [...given.values()]
    .map((a) => entryOf(a, byId.get(a.offerId), cardById.get(a.offerId) ?? null))
    .sort((a, b) => compare(a.answeredOn, b.answeredOn) || compare(a.offerId, b.offerId));
  return ok({ cards, entries });
}

/** Whole calendar days from `from` to `to` (both `YYYY-MM-DD`). */
function daysBefore(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function stateOf(offer: ExchangeOffer | undefined, card: MatchCard | null): EntryState {
  if (!offer) return "unavailable";
  if (!card) return "wish_done";
  return offer.requested ? "requested" : "open";
}

/** The entry of one stored answer; the live offer wins over the copied names, which only serve when the offer is gone. */
function entryOf(
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
