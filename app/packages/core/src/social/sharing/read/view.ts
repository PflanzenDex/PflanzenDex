import type { PrivacySwitch, SharedFacts, SharedSpecimen, SharingStore } from "../types";

export interface FriendViewDependencies {
  readonly sharing: SharingStore;
  readonly privacy: PrivacySwitch;
  readonly facts: SharedFacts;
}

/**
 * What `ownerId` shows the caller (US-SOZ-04, FR-SOZ-01, P-05): the specimens the owner shared, with the whitelisted
 * facts only, and nothing at all when the two are no confirmed friends (the database decides, so ending a friendship
 * withdraws everything at once) or the owner switched "Everything private" on (suspends, never deletes). Archived
 * specimens are not shown (the facts leave them out). The photo flag follows `Share_Photos`. "Unknown" stays `null`
 * (P-08). A friend who shares nothing and one who is not a friend look the same: an empty list.
 */
export async function friendView(
  deps: FriendViewDependencies,
  viewerId: string,
  ownerId: string,
): Promise<{ specimens: readonly SharedSpecimen[] }> {
  const rows = await deps.sharing.sharedBy(viewerId, ownerId);
  if (rows.length === 0 || (await deps.privacy.everythingPrivate(ownerId)))
    return { specimens: [] };
  const facts = await deps.facts.describe(
    ownerId,
    rows.map((r) => r.specimenId),
  );
  const photos = new Map(rows.map((r) => [r.specimenId, r.photos]));
  return {
    specimens: facts.map((f) => ({
      id: f.id,
      speciesLatin: f.speciesLatin,
      speciesGerman: f.speciesGerman,
      name: f.name,
      caughtAt: f.caughtAt,
      isCutting: f.isCutting,
      repottedAt: f.repottedAt ?? null,
      photoShared: photos.get(f.id) === true,
    })),
  };
}
