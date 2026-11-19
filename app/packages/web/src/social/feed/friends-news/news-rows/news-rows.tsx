import type { Banner, BannerItem } from "@pflanzendex/core";
import type { PagedGroup } from "@/shared/patterns/responsive/paged-groups/paged-groups";
import { GroupedRow } from "@/shared/lists/grouped-list/grouped-list";
import { texts } from "@/shared/lib/text-rules/texts";
import { speciesText } from "../../friends-banner/friends-banner";
import { nameOf } from "../../../parts/request-list/request-list";
import table from "../../../social.de.json";

const t = texts(table);

/** One row of the layer: a species of one friend; `friend` names the friend where the choice does not (the read plants). */
export type NewsRow = { key: string; item: BannerItem; friend: string | null };

/** The plants of some entries: a choice counts plants, not rows (US-SOZ-06). */
const plantsOf = (items: readonly BannerItem[]) => items.reduce((n, i) => n + i.count, 0);

/** One row per entry. The key is the entry's place, since two unnamed plants of one friend may share a species text. */
const rowsOf = (items: readonly BannerItem[], named: boolean): NewsRow[] =>
  items.map((item, n) => ({
    key: `${item.friendId}:${n}`,
    item,
    friend: named ? nameOf(item.friendName) : null,
  }));

/**
 * The choices of the layer (US-QS-32): one per friend with new plants, in the order of the banner, and "Gelesen" last with
 * what was read (US-SOZ-06). Each choice counts its plants; the friend's name is its label, so its rows do not repeat it.
 */
export function groupsOf(banner: Banner): PagedGroup<NewsRow>[] {
  const friends = new Map<string, { name: string | null; items: BannerItem[] }>();
  for (const item of banner.items) {
    const friend = friends.get(item.friendId) ?? { name: item.friendName, items: [] };
    friend.items.push(item);
    friends.set(item.friendId, friend);
  }
  const groups: PagedGroup<NewsRow>[] = [...friends].map(([friendId, friend]) => ({
    key: `friend-${friendId}`,
    label: nameOf(friend.name),
    count: plantsOf(friend.items),
    items: rowsOf(friend.items, false),
  }));
  if (banner.read.length > 0)
    groups.push({
      key: "read",
      label: t("news.read"),
      count: plantsOf(banner.read),
      items: rowsOf(banner.read, true),
    });
  return groups;
}

/**
 * One row of the layer (US-QS-32): the species, its count from two plants on as "N ×", the friend's name on the read plants,
 * and a link to the friend's collection (`/friends/<friendId>`, the friendship id the friend list takes). Following it
 * leaves the layer, which marks what it showed as read (US-SOZ-06).
 */
export function NewsRowLink({ row }: { row: NewsRow }) {
  const { item } = row;
  return (
    <GroupedRow
      bare
      to={`/friends/${item.friendId}`}
      title={speciesText(item)}
      {...(row.friend === null ? {} : { meta: row.friend })}
      {...(item.count > 1 ? { trailing: t("news.count", { count: item.count }) } : {})}
    />
  );
}
