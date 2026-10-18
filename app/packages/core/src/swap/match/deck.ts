import { ok, type Result } from "../../kernel";
import { exchangeList, type ExchangeQuery } from "../exchange";
import type { ExchangeDependencies, ExchangeOffer } from "../exchange";
import type { MatchAnswers } from "./answer/types";

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

/**
 * The match deck (US-TAU-01): the exchange list narrowed to offers whose species is on the caller's own wishlist.
 * It reuses the exchange read, so only open offers of confirmed friends with `Share = friends` can appear and the
 * wishlist is only asked per species (P-05, FR-WUN-07, FR-TAU-02). The match is the exact species and nothing else
 * (FR-TAU-04); an offer of an unknown species never matches. What the caller answered is derived on every read
 * (NFR-04, US-TAU-02): `cards` are the offers without an answer, `later` those answered with Later (still findable,
 * P-10); an offer answered with No leaves the deck. Offers the caller has requested already are not in `later`.
 */
export async function matchDeck(
  deps: ExchangeDependencies,
  answers: MatchAnswers,
  userId: string,
  query: Pick<ExchangeQuery, "timeZone">,
): Promise<Result<{ readonly cards: readonly MatchCard[]; readonly later: readonly MatchCard[] }>> {
  const list = await exchangeList(deps, userId, { timeZone: query.timeZone });
  if (!list.ok) return list;
  const given = new Map((await answers.list(userId)).map((a) => [a.offerId, a.answer]));
  const matching = list.value.offers
    .flatMap((o): MatchCard[] =>
      o.onWishlist && o.speciesLatin !== null
        ? [{ ...o, reasons: [{ kind: "wishlist", species: o.speciesLatin }] }]
        : [],
    )
    .sort(deckOrder);
  return ok({
    cards: matching.filter((c) => !given.has(c.offerId)),
    later: matching.filter((c) => given.get(c.offerId) === "later" && !c.requested),
  });
}
