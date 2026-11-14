/**
 * Why the deck has no card to decide, in the order the keeper can act on it (US-TAU-07, P-09). `all_decided`: offers
 * match a wish, but the keeper has requested or answered every one of them (US-TAU-03).
 */
export type EmptyReason = "no_friends" | "no_wishes" | "no_offers" | "no_match" | "all_decided";

/** Numbers of the keeper's own data that explain an empty deck; never data of a friend (P-05). */
export interface MatchCounts {
  /** Confirmed friends of the caller. */
  friends(userId: string): Promise<number>;
  /** Open plant wishes of the caller. */
  wishes(userId: string): Promise<number>;
}

/**
 * The first thing missing for a card, from the keeper's own numbers: no friends, then an empty wishlist, then no open
 * offers of friends at all, then `all_decided` when offers match a wish and none is left as a card, otherwise offers
 * exist but none matches a wish. Nothing is guessed (P-08); `null` while the counts are not asked.
 */
export async function emptyReason(
  counts: MatchCounts | undefined,
  userId: string,
  offers: number,
  matching: number,
): Promise<EmptyReason | null> {
  if (!counts) return null;
  if ((await counts.friends(userId)) === 0) return "no_friends";
  if ((await counts.wishes(userId)) === 0) return "no_wishes";
  if (offers === 0) return "no_offers";
  return matching > 0 ? "all_decided" : "no_match";
}
