import type { Feed } from "@pflanzendex/core";
import { call, currentTimeZone, type Response } from "../../kernel";

export interface FeedFilter {
  /** The friendship id, or `null` for all friends. */
  readonly friendId: string | null;
  readonly days: number;
  readonly onlyNewSpecies: boolean;
}

/** Loads "Neu bei Freunden" (US-SOZ-05): derived by the server on every request; "today" is the local date of the profile's time zone (NFR-08). */
export function loadFeed(
  api: string,
  token: string,
  filter: FeedFilter,
  fetchFn: typeof fetch = fetch,
): Promise<Response<Feed>> {
  const query = new URLSearchParams({ timeZone: currentTimeZone(), days: String(filter.days) });
  if (filter.friendId) query.set("friend", filter.friendId);
  if (filter.onlyNewSpecies) query.set("onlyNewSpecies", "true");
  return call<Feed>(fetchFn, `${api}/feed?${query.toString()}`, token);
}
