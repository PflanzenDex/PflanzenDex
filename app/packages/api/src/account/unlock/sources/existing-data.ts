import {
  EquipmentPostgres,
  FriendsPostgres,
  OffersPostgres,
  SwapsPostgres,
  WishesPostgres,
} from "@pflanzendex/db";
import type { Pool } from "pg";

/**
 * Which staged functions already hold data of the account (US-ONB-05, P-10): a wish, a friend or an open request (a
 * redeemed invitation), an offer or a swap, a piece of equipment. Such a function is open whatever its rule says, so it
 * never disappears behind a lock. Read through the ports of the owning modules, as the account itself (P-04); only
 * existence matters. An invitation code nobody has redeemed yet is not read: the app role cannot read that table.
 */
export function existingDataOf(pool: Pool) {
  const wishes = new WishesPostgres(pool);
  const friends = new FriendsPostgres(pool);
  const offers = new OffersPostgres(pool);
  const swaps = new SwapsPostgres(pool);
  const equipment = new EquipmentPostgres(pool);
  return async (userId: string): Promise<ReadonlySet<string>> => {
    const [open, bought, mine, requests, offered, swapped, gear] = await Promise.all([
      wishes.open(userId),
      wishes.bought(userId),
      friends.friends(userId),
      friends.openRequests(userId),
      offers.list(userId),
      swaps.list(userId),
      equipment.list(userId),
    ]);
    const found = new Set<string>();
    if (open.length + bought.length > 0) ["wishlist", "discover"].forEach((id) => found.add(id));
    if (mine.length + requests.length > 0) ["friends", "swapping"].forEach((id) => found.add(id));
    if (offered.length + swapped.length > 0) found.add("swapping");
    if (gear.length > 0) found.add("equipment");
    return found;
  };
}
