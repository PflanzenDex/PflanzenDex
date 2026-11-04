import {
  EquipmentPostgres,
  FriendsPostgres,
  OffersPostgres,
  SwapsPostgres,
  hasOpenOrBoughtWish,
} from "@pflanzendex/db";
import type { Pool } from "pg";

/**
 * Which staged functions already hold data of the account (US-ONB-05, P-10): a wish, a friend or an open request (a
 * redeemed invitation), an offer or a swap, a piece of equipment. Such a function is open whatever its rule says, so it
 * never disappears behind a lock. Read through the ports of the owning modules, as the account itself (P-04); only
 * existence matters, so each module answers with one `exists` check on the same rows its list used to return (NFR-12).
 * An invitation code nobody has redeemed yet is not read: the app role cannot read that table.
 */
export function existingDataOf(pool: Pool) {
  const friends = new FriendsPostgres(pool);
  const offers = new OffersPostgres(pool);
  const swaps = new SwapsPostgres(pool);
  const equipment = new EquipmentPostgres(pool);
  return async (userId: string): Promise<ReadonlySet<string>> => {
    const [wish, social, offer, swap, gear] = await Promise.all([
      hasOpenOrBoughtWish(pool, userId),
      friends.hasFriendsOrRequests(userId),
      offers.hasAny(userId),
      swaps.hasAny(userId),
      equipment.hasAny(userId),
    ]);
    const found = new Set<string>();
    if (wish) ["wishlist", "discover"].forEach((id) => found.add(id));
    if (social) ["friends", "swapping"].forEach((id) => found.add(id));
    if (offer || swap) found.add("swapping");
    if (gear) found.add("equipment");
    return found;
  };
}
