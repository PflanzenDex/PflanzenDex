import type { TodayList } from "@pflanzendex/core";
import { call, currentTimeZone, type Response } from "../shared/data";

/**
 * The query key of the central "Today" list (TE-07). The area reloads it when a write changes what it derives from
 * (SG-FEED-01, `useTodayFollowsWrites`), so the key is exported here and not kept by the page.
 */
export const TODAY_LIST_KEY = ["today", "list"] as const;

/**
 * Loads the central "Today" list (TE-07). The profile's time zone (US-ACC-02; the device's as fallback) decides what
 * "today" is (NFR-08); the list is derived on the server and never stored (P-01).
 */
export function loadToday(
  api: string,
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<Response<TodayList>> {
  const timeZone = encodeURIComponent(currentTimeZone());
  return call<TodayList>(fetchFn, `${api}/today?timeZone=${timeZone}`, token);
}
