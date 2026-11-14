import {
  daysBetween,
  isTimeZone,
  localToday,
  ok,
  type Result,
  failed,
  appError,
} from "../../kernel";
import { exchangeList, type ExchangeQuery } from "../exchange";
import type { ExchangeDependencies, ExchangeOffer } from "../exchange";
import type { MatchAnswers, StoredMatchAnswer } from "./answer/types";
import { emptyReason, type EmptyReason, type Held, type MatchCounts } from "./empty";
import {
  bothWays,
  ownOffersAsked,
  type BothWaysReason,
  type FriendWishes,
  type MyOffers,
} from "./both-ways";

/** Days a "Later" card stays out of the deck (starting value 1 day, assumption of the PO). */
export const LATER_DAYS = 1;

/** The wish behind a card (US-TAU-04): the species it names and the keeper's own reasoning, nothing more (P-08). */
export interface WishlistReason {
  readonly kind: "wishlist";
  /** The Latin name of the species; the wish is named by it. */
  readonly species: string;
  /** The reasoning the keeper wrote for the wish, exactly as written; `null` = none (US-TAU-04). */
  readonly reasoning: string | null;
}

/** The verifiable fact why a card appears or what makes it special; every reason comes from domain data, never a model (P-01). */
export type FitReason = WishlistReason | BothWaysReason;

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

/** Why a match is no card: my open request (`requested`, listed under Requests) or my No or Later (`answered`). */
type Hold = "requested" | "answered" | null;

function holdOf(requested: boolean, answer: StoredMatchAnswer | undefined, today: string): Hold {
  if (requested) return "requested";
  if (!answer) return null;
  const back = answer.answer === "later" && daysBetween(answer.answeredOn, today) >= LATER_DAYS;
  return back ? null : "answered";
}

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

/** What the deck needs besides the exchange: the private answers, the clock (NFR-08), the counts that explain an empty deck and the own offers for "fits both ways". */
export interface MatchContext {
  readonly answers: MatchAnswers;
  readonly clock: () => Date;
  readonly counts?: MatchCounts;
  readonly mine?: MyOffers;
  /** The marked wishes of friends for "fits both ways" (DM-TAU-02); without it only open requests count. */
  readonly friendWishes?: FriendWishes;
}

/**
 * The deck as one read (US-TAU-01 to US-TAU-06): the exchange list narrowed to offers whose species is on the caller's
 * wishlist, with the reasons of each card, derived on every read (NFR-04). `entries` lists every answer with its state (P-10).
 */
export async function readDeck(
  deps: ExchangeDependencies,
  context: MatchContext,
  userId: string,
  query: Pick<ExchangeQuery, "timeZone">,
) {
  if (!isTimeZone(query.timeZone))
    return failed(
      appError("input.invalid", { details: [{ field: "timeZone", code: "input.invalid" }] }),
    );
  const list = await exchangeList(deps, userId, { timeZone: query.timeZone });
  if (!list.ok) return list;
  const today = localToday(context.clock(), query.timeZone);
  const given = new Map((await context.answers.list(userId)).map((a) => [a.offerId, a]));
  const wished = list.value.offers.filter((o) => o.onWishlist && o.speciesLatin !== null);
  const reasoning = await deps.wishes.reasoningOf(userId, [
    ...new Set(wished.map((o) => o.speciesLatin as string)),
  ]);
  const asked = await ownOffersAsked(deps, context.mine, userId, context.friendWishes);
  const matching = wished
    .map((o): MatchCard => ({
      ...o,
      reasons: [
        {
          kind: "wishlist",
          species: o.speciesLatin as string,
          reasoning: reasoning.get(o.speciesLatin as string) ?? null,
        },
        ...bothWays(o, asked),
      ],
    }))
    .sort(deckOrder);
  const holds = matching.map((c) => holdOf(c.requested, given.get(c.offerId), today));
  const cards = matching.filter((_, i) => holds[i] === null);
  const held: Held = {
    requested: holds.filter((h) => h === "requested").length,
    answered: holds.filter((h) => h === "answered").length,
  };
  const byId = new Map(list.value.offers.map((o) => [o.offerId, o]));
  const cardById = new Map(matching.map((c) => [c.offerId, c]));
  const entries = [...given.values()]
    .map((a) => entryOf(a, byId.get(a.offerId), cardById.get(a.offerId) ?? null))
    .sort((a, b) => compare(a.answeredOn, b.answeredOn) || compare(a.offerId, b.offerId));
  const empty =
    cards.length > 0
      ? null
      : await emptyReason(context.counts, userId, list.value.offers.length, held);
  const requested = new Set(matching.filter((c) => c.requested).map((c) => c.offerId));
  return ok({ cards, entries, empty, requested });
}

/**
 * The match deck (US-TAU-01): the cards, the answers and the reason of an empty deck, as `readDeck` reads them. Only open
 * offers of confirmed friends with `Share = friends` appear (P-05, FR-TAU-02); the match is the exact species (FR-TAU-04).
 * An offer with my No or Later stays out (Later comes back after a day), and one with my open request is no card (US-TAU-03).
 */
export async function matchDeck(
  deps: ExchangeDependencies,
  context: MatchContext,
  userId: string,
  query: Pick<ExchangeQuery, "timeZone">,
): Promise<
  Result<{
    readonly cards: readonly MatchCard[];
    readonly entries: readonly MatchEntry[];
    /** Set when `cards` is empty and the counts are known: the reason and so the next step (US-TAU-07). */
    readonly empty: EmptyReason | null;
  }>
> {
  const r = await readDeck(deps, context, userId, query);
  return r.ok ? ok({ cards: r.value.cards, entries: r.value.entries, empty: r.value.empty }) : r;
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
