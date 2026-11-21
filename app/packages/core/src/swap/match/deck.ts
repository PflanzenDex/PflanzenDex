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
import { entryOf, type MatchEntry } from "./answer/entries";
import { emptyReason, type EmptyReason, type Held, type MatchCounts } from "./empty";
import {
  bothWays,
  ownOffersAsked,
  type BothWaysReason,
  type FriendWishes,
  type MyOffers,
} from "./both-ways";

export type { EntryState, MatchEntry } from "./answer/entries";

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
  /** The catalog picture of the species, a link (US-QS-32); `null` = none known (P-08). Never a photo of the friend (P-05). */
  readonly imageUrl: string | null;
  /** The Wikipedia page of that picture, for its credit (CC BY-SA, FR-POK-07); `null` = unknown. */
  readonly imageSourceUrl: string | null;
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

/** The catalog picture of one species (US-QS-32): a link to the picture and to its Wikipedia page; `null` = none known (P-08). Public catalog data, shared by all accounts. */
export interface CatalogPicture {
  readonly imageUrl: string | null;
  /** The Wikipedia page the picture comes from, for the credit (CC BY-SA, FR-POK-07). */
  readonly sourceUrl: string | null;
}

/** Port (ADR 0012): the catalog pictures of the given Latin names; a species without a row is missing from the map. The app root wires it. */
export interface CatalogPictures {
  of(latinNames: readonly string[]): Promise<ReadonlyMap<string, CatalogPicture>>;
}

/** The picture fields of a card: the catalog picture of its species, `null` where none is known (US-QS-32, P-08). */
function pictureOf(pictures: ReadonlyMap<string, CatalogPicture>, species: string) {
  const picture = pictures.get(species);
  return { imageUrl: picture?.imageUrl ?? null, imageSourceUrl: picture?.sourceUrl ?? null };
}

/** What the deck needs besides the exchange: the private answers, the clock (NFR-08), the counts that explain an empty deck, the own offers for "fits both ways" and the catalog pictures (US-QS-32). */
export interface MatchContext {
  readonly answers: MatchAnswers;
  readonly clock: () => Date;
  readonly counts?: MatchCounts;
  readonly mine?: MyOffers;
  /** The marked wishes of friends for "fits both ways" (DM-TAU-02); without it only open requests count. */
  readonly friendWishes?: FriendWishes;
  /** The catalog pictures of the cards (US-QS-32); without it every card has no picture (P-08). */
  readonly pictures?: CatalogPictures;
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
  const species = [...new Set(wished.map((o) => o.speciesLatin as string))];
  const reasoning = await deps.wishes.reasoningOf(userId, species);
  const asked = await ownOffersAsked(deps, context.mine, userId, context.friendWishes);
  const pictures = (await context.pictures?.of(species)) ?? new Map<string, CatalogPicture>();
  const matching = wished
    .map((o): MatchCard => ({
      ...o,
      ...pictureOf(pictures, o.speciesLatin as string),
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
    readonly requested: number; // my open requests on matching offers (US-TAU-02)
  }>
> {
  const r = await readDeck(deps, context, userId, query);
  if (!r.ok) return r;
  const { cards, entries, empty, requested } = r.value;
  return ok({ cards, entries, empty, requested: requested.size });
}
