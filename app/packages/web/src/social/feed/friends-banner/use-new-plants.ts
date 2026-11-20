import { useCallback, useEffect, useRef } from "react";
import type { Banner } from "@pflanzendex/core";
import { SCREEN_STALE_TIME, useInvalidate, useRequest, useWriteAction } from "../../../shared/data";
import { loadBanner, markFeedSeen } from "../../api/feed-api";

const KEY = ["social", "banner"] as const;
export type Token = () => Promise<string | undefined>;

/**
 * The first visit marks the feed as seen without a word (US-SOZ-06: silent creation, no banner for what was shared before
 * the person looked). Runs once per loaded state.
 */
function useFirstVisit(api: string, token: Token, banner: Banner | undefined, reload: () => void) {
  const done = useRef(false);
  useEffect(() => {
    if (!banner?.firstVisit || done.current) return;
    done.current = true;
    void (async () => {
      const t = await token();
      if (t) await markFeedSeen(api, t, banner.asOf);
      reload();
    })();
  }, [api, token, banner, reload]);
}

/**
 * The news about new plants of friends (US-SOZ-06), shared by the banner on "Freunde" and the tile and layer on "Heute":
 * one request, one cached copy. `banner` is the copy as loaded, or `null` on the first visit (marked as seen silently) and
 * while it loads; it may hold nothing new but plants that were read. `news` is the banner only when something is new.
 */
export function useNewPlants(api: string, token: Token) {
  const reload = useInvalidate(KEY);
  const load = useCallback((tk: string) => loadBanner(api, tk), [api]);
  const r = useRequest({ queryKey: KEY, token, load, staleTime: SCREEN_STALE_TIME });
  const okay = useWriteAction(token, reload);
  useFirstVisit(api, token, r.value, reload);
  const banner = r.value && !r.value.firstVisit ? r.value : null;
  const news = banner && banner.count > 0 ? banner : null;
  return { status: r.status, offline: r.offline, banner, news, okay, reload };
}
