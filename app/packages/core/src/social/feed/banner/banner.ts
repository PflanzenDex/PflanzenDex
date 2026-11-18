import type { FriendStore } from "../../friendship";
import type { FriendViewDependencies } from "../../sharing";
import type { SharedSpecimen, SharingRowSince } from "../../sharing";
import type { Banner, BannerItem, FeedSeenStore } from "./types";

export interface BannerDependencies extends FriendViewDependencies {
  readonly friends: FriendStore;
  readonly seen: FeedSeenStore;
}

/**
 * Days a plant that was new and got marked as seen stays under "Gelesen" (US-SOZ-06). An assumption, a starting value
 * (P-08), not a measured number: the owner may change it. Older seen plants are not read any more; "Neu bei Freunden"
 * (US-SOZ-05) still lists them.
 */
export const READ_DAYS = 7;
const READ_MS = READ_DAYS * 24 * 60 * 60 * 1000;

type Friend = { id: string; name: string | null; accountId: string };

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

/** Whether a share became visible inside the read window before `asOf` (instants compared, the window is open at its start). */
const inReadWindow = (visibleSince: string, asOf: string): boolean =>
  Date.parse(visibleSince) > Date.parse(asOf) - READ_MS;

/**
 * What one friend shares that became visible since `seen` (new) and what became visible before it but within the read
 * window (read). The same privacy rules for both: nothing while the friend has "Everything private" on, nothing that is
 * not shared, nothing after the friendship ended (the store answers no rows then, P-05).
 */
async function newsOf(
  deps: BannerDependencies,
  userId: string,
  friend: Friend,
  clock: { seen: string; asOf: string },
): Promise<{ fresh: BannerItem[]; read: BannerItem[] }> {
  const { seen, asOf } = clock;
  const rows: readonly SharingRowSince[] = await deps.sharing.sharedBySince(
    userId,
    friend.accountId,
  );
  const fresh = rows.filter((r) => r.visibleSince > seen);
  const old = rows.filter((r) => r.visibleSince <= seen && inReadWindow(r.visibleSince, asOf));
  if (
    (fresh.length === 0 && old.length === 0) ||
    (await deps.privacy.everythingPrivate(friend.accountId))
  )
    return { fresh: [], read: [] };
  const freshIds = new Set(fresh.map((r) => r.specimenId));
  const oldIds = new Set(old.map((r) => r.specimenId));
  const facts = await deps.facts.describe(friend.accountId, [...freshIds, ...oldIds]);
  const shared = facts.map((x) => ({ ...x, photoShared: false }));
  return {
    fresh: summarize(
      friend,
      shared.filter((x) => freshIds.has(x.id)),
    ),
    read: summarize(
      friend,
      shared.filter((x) => oldIds.has(x.id)),
    ),
  };
}

/**
 * The banner "Friends have N new plants" (US-SOZ-06): what became visible to me since the last time I marked the feed as
 * seen. New means visible since then (shared or friendship started), not caught since then: an old specimen that is
 * shared today is new to me today. Read through the sharing of the friends (never a private specimen, nothing while a
 * friend has "Everything private" on, nothing after the friendship ended, P-05). What was new and got marked as seen
 * within `READ_DAYS` comes back as `read`, so "Gelesen" can show it; `count` counts the new ones only. On the very first
 * visit nothing is new: `firstVisit` tells the screen to mark the feed as seen silently, so there is no banner for what
 * was shared before.
 */
export async function friendBanner(deps: BannerDependencies, userId: string): Promise<Banner> {
  // One clock for the banner: the store's (the database's), the one that stamps visible_since and clamps "Okay".
  const asOf = await deps.seen.now();
  const seen = await deps.seen.seenAt(userId);
  if (seen === null) return { firstVisit: true, count: 0, items: [], read: [], asOf };
  const friends = await deps.friends.friends(userId);
  const items: BannerItem[] = [];
  const read: BannerItem[] = [];
  for (const f of friends) {
    const news = await newsOf(deps, userId, f, { seen, asOf });
    items.push(...news.fresh);
    read.push(...news.read);
  }
  return {
    firstVisit: false,
    count: items.reduce((n, i) => n + i.count, 0),
    items,
    read,
    asOf,
  };
}
