import type { Banner, Feed } from "@pflanzendex/core";
import { call, createWrite, currentTimeZone, type Response } from "../../kernel";

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

/** The banner "Friends have N new plants" (US-SOZ-06); `firstVisit` means the feed was never opened. */
export const loadBanner = (
  api: string,
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<Response<Banner>> => call<Banner>(fetchFn, `${api}/feed/banner`, token);

/** "Okay" on the banner and the silent creation of the first visit (US-SOZ-06): marks the feed as seen up to `upTo`. */
export async function markFeedSeen(
  api: string,
  token: string,
  upTo: string,
  fetchFn: typeof fetch = fetch,
): Promise<Response<{ seenAt: string }>> {
  const r = await createWrite(api, token, fetchFn)("POST", "/feed/seen", { upTo });
  return r.ok ? { ok: true, value: r.value as { seenAt: string } } : r;
}
