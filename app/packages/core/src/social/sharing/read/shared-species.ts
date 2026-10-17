import { friendView, type FriendViewDependencies } from "./view";

/** Port: the Latin names of the species the account has caught (active specimens); `collection` and `catalog` answer it. */
export interface OwnSpeciesNames {
  latinNamesOf(userId: string): Promise<readonly string[]>;
}

/**
 * The number of species a friend shares with me that I have caught too (US-SOZ-03, US-SOZ-04). Only what the friend
 * shares can be counted, so a friend who shares nothing (or who is not a friend, or switched "Everything private" on)
 * is `null` = unknown, not 0 (P-08); 0 means the friend shares species and none of them is mine. A plain number, not
 * a score (FR-SOZ-11). Species the friend shares without a known name are not counted.
 */
export async function sharedSpeciesCount(
  deps: FriendViewDependencies & { readonly mine: OwnSpeciesNames },
  viewerId: string,
  ownerId: string,
): Promise<number | null> {
  const { specimens } = await friendView(deps, viewerId, ownerId);
  if (specimens.length === 0) return null;
  const mine = new Set(await deps.mine.latinNamesOf(viewerId));
  const shared = new Set(specimens.flatMap((s) => (s.speciesLatin ? [s.speciesLatin] : [])));
  return [...shared].filter((name) => mine.has(name)).length;
}
