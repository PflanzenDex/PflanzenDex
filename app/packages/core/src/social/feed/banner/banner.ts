import type { FriendStore } from "../../friendship";
import type { FriendViewDependencies } from "../../sharing";
import type { SharedSpecimen } from "../../sharing";
import type { Banner, BannerItem, FeedSeenStore } from "./types";

export interface BannerDependencies extends FriendViewDependencies {
  readonly friends: FriendStore;
  readonly seen: FeedSeenStore;
  readonly now: () => Date;
}

/** Summarizes new specimens per friend and species. */
function summarize(
  friend: { id: string; name: string | null },
  specimens: readonly SharedSpecimen[],
): BannerItem[] {
  const groups = new Map<string, BannerItem>();
  for (const s of specimens) {
    const key = s.speciesLatin ?? s.id;
    const group = groups.get(key);
    groups.set(key, {
      friendId: friend.id,
      friendName: friend.name,
      speciesLatin: s.speciesLatin,
      speciesGerman: s.speciesGerman,
      count: (group?.count ?? 0) + 1,
    });
  }
  return [...groups.values()];
}

/**
 * The banner "Friends have N new plants" (US-SOZ-06): what became visible to me since the last time I marked the feed as
 * seen. New means visible since then (shared or friendship started), not caught since then: an old specimen that is
 * shared today is new to me today. Read through the sharing of the friends (never a private specimen, nothing while a
 * friend has "Everything private" on, nothing after the friendship ended, P-05). On the very first visit nothing is
 * new: `firstVisit` tells the screen to mark the feed as seen silently, so there is no banner for what was shared before.
 */
export async function friendBanner(deps: BannerDependencies, userId: string): Promise<Banner> {
  const asOf = deps.now().toISOString();
  const seen = await deps.seen.seenAt(userId);
  if (seen === null) return { firstVisit: true, count: 0, items: [], asOf };
  const friends = await deps.friends.friends(userId);
  const items: BannerItem[] = [];
  for (const f of friends) {
    const rows = (await deps.sharing.sharedBySince(userId, f.accountId)).filter(
      (r) => r.visibleSince > seen,
    );
    if (rows.length === 0 || (await deps.privacy.everythingPrivate(f.accountId))) continue;
    const facts = await deps.facts.describe(
      f.accountId,
      rows.map((r) => r.specimenId),
    );
    items.push(
      ...summarize(
        { id: f.id, name: f.name },
        facts.map((x) => ({ ...x, photoShared: false })),
      ),
    );
  }
  return {
    firstVisit: false,
    count: items.reduce((n, i) => n + i.count, 0),
    items,
    asOf,
  };
}
