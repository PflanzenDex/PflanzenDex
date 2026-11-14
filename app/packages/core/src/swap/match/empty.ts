/**
 * Why the deck has no card to decide, in the order the keeper can act on it (US-TAU-07, P-09). `all_requested`: every
 * offer that matches a wish has my open request, so the next step is Requests. `all_answered`: no card is left because
 * my No or Later holds the rest, so the next step is the Later list (and the declined list).
 */
export type EmptyReason =
  "no_friends" | "no_wishes" | "no_offers" | "no_match" | "all_requested" | "all_answered";

/** The matches that no card is left of, counted from the deck's own filter (US-TAU-07, P-08: nothing is guessed). */
export interface Held {
  /** Matches on which I have an open request. */
  readonly requested: number;
  /** Matches that my No or Later holds back. */
  readonly answered: number;
}

/** Numbers of the keeper's own data that explain an empty deck; never data of a friend (P-05). */
export interface MatchCounts {
  /** Confirmed friends of the caller. */
  friends(userId: string): Promise<number>;
  /** Open plant wishes of the caller. */
  wishes(userId: string): Promise<number>;
}

/**
 * The first thing missing for a card, from the keeper's own numbers: no friends, then an empty wishlist, then no open
 * offers of friends at all; then, when the deck has no card, the holds it counted: none means no offer matches a wish,
 * only requests mean `all_requested`, and any answer means `all_answered`. `null` while the counts are not asked.
 */
export async function emptyReason(
  counts: MatchCounts | undefined,
  userId: string,
  offers: number,
  held: Held,
): Promise<EmptyReason | null> {
  if (!counts) return null;
  if ((await counts.friends(userId)) === 0) return "no_friends";
  if ((await counts.wishes(userId)) === 0) return "no_wishes";
  if (offers === 0) return "no_offers";
  if (held.requested + held.answered === 0) return "no_match";
  return held.answered === 0 ? "all_requested" : "all_answered";
}
