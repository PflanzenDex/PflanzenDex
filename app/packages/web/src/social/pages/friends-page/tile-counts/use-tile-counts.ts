import { useCallback } from "react";
import { SCREEN_STALE_TIME, useRequest } from "../../../../shared/data";
import { loadBanner } from "../../../api/feed-api";
import { loadMatchingCount, loadOpenOffersCount } from "../../../api/offer-counts-api";
import type { TileCount } from "../friend-tiles/friend-tiles";

export type Token = () => Promise<string | undefined>;

/** Calm mode shows no counts (US-ACH-08, US-TAU-07); otherwise the count of the news banner while it loads or fails (P-10). */
function useNewsCount(api: string, token: Token, calm: boolean): TileCount {
  const load = useCallback((t: string) => loadBanner(api, t), [api]);
  const r = useRequest({
    queryKey: ["social", "banner"],
    token,
    load,
    staleTime: SCREEN_STALE_TIME,
  });
  if (calm) return "hidden";
  if (r.status === "error") return "error";
  return r.value === undefined ? "loading" : r.value.firstVisit ? 0 : r.value.count;
}

/** The count of the exchange tiles: not asked in calm mode or while the function is locked (US-ACH-08, US-ONB-05); loading and failing show (P-10). */
function useOfferCount(
  props: { api: string; token: Token; key: string; enabled: boolean },
  fetchCount: (api: string, token: string) => ReturnType<typeof loadOpenOffersCount>,
): TileCount | undefined {
  const { api, enabled } = props;
  const load = useCallback((t: string) => fetchCount(api, t), [api, fetchCount]);
  const r = useRequest({
    queryKey: ["social", "tile-count", props.key],
    token: props.token,
    load,
    enabled,
  });
  if (!enabled) return undefined;
  if (r.status === "error") return "error";
  return r.value === undefined ? "loading" : r.value;
}

export type Options = {
  /** Calm mode is on or not known yet: the tiles show their names without counts (US-ACH-08). */
  calm: boolean;
  /** The text mark of the exchange while "Tauschbörse" is not open yet (US-ONB-05); the tiles still lead to the lock page. */
  swapMark?: string | undefined;
};

/** The counts of the tiles that load by themselves (US-QS-20); `undefined` means no count is shown. */
export function useTileCounts(api: string, token: Token, options: Options) {
  const counted = !options.calm && !options.swapMark;
  return {
    news: useNewsCount(api, token, options.calm),
    offers: useOfferCount({ api, token, key: "offers", enabled: counted }, loadOpenOffersCount),
    matching: useOfferCount({ api, token, key: "matching", enabled: counted }, loadMatchingCount),
  };
}
