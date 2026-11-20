import { useCallback, useEffect, useRef } from "react";
import type { Banner, BannerItem } from "@pflanzendex/core";
import { Button } from "@/shared/ui/button/button";
import { cn } from "@/shared/lib/utils";
import { texts } from "@/shared/lib/text-rules/texts";
import { SCREEN_STALE_TIME, useInvalidate, useRequest, useWriteAction } from "../../../shared/data";
import { loadBanner, markFeedSeen } from "../../api/feed-api";
import { dateText } from "../../parts/invite-card/invite-card";
import { nameOf } from "../../parts/request-list/request-list";
import { RequestsNotice } from "../requests-notice/requests-notice";
import table from "../../social.de.json";

const t = texts(table);
const KEY = ["social", "banner"] as const;
type Token = () => Promise<string | undefined>;

const speciesText = (i: BannerItem) =>
  i.speciesGerman ?? i.speciesLatin ?? t("news.speciesUnknown");
const itemText = (i: BannerItem) => `${nameOf(i.friendName)}: ${i.count} × ${speciesText(i)}`;

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
 * one request, one cached copy. `news` is the banner to show, or `null` when there is nothing new (also on the first
 * visit, which is marked as seen silently).
 */
export function useNewPlants(api: string, token: Token) {
  const reload = useInvalidate(KEY);
  const load = useCallback((tk: string) => loadBanner(api, tk), [api]);
  const r = useRequest({ queryKey: KEY, token, load, staleTime: SCREEN_STALE_TIME });
  const okay = useWriteAction(token, reload);
  useFirstVisit(api, token, r.value, reload);
  const banner = r.value;
  const news = !banner || banner.firstVisit || banner.count === 0 ? null : banner;
  return { status: r.status, offline: r.offline, news, okay };
}

/**
 * What is new, when it was read, and "Okay" (US-SOZ-06, FR-SOZ-03). `onSeen` follows a successful "Okay". `compact` is
 * one row with "Okay" at its end and no "Stand" line, for a place that says "Stand" itself (the layer "Neu bei Freunden",
 * owner decision 2026-11-02, issue 1157); without a network the "Stand" stays, so an old copy is still recognizable.
 */
export function NewPlantsBody(props: {
  api: string;
  news: Banner;
  offline: boolean;
  okay: ReturnType<typeof useNewPlants>["okay"];
  onSeen?: () => void;
  compact?: boolean;
}) {
  const { news, okay, compact } = props;
  const seen = async () => {
    await okay.run((tk) => markFeedSeen(props.api, tk, news.asOf), t("news.okayDone"));
    props.onSeen?.();
  };
  return (
    <>
      <p className={compact ? "min-w-0 flex-1 basis-48" : undefined}>
        <strong>
          {news.count === 1
            ? t("news.headline.one")
            : t("news.headline.other", { count: news.count })}
        </strong>{" "}
        {news.items.map(itemText).join(", ")}
      </p>
      {compact && !props.offline ? null : (
        <p className="text-sm text-muted-foreground">
          {t("news.asOf", { date: dateText(news.asOf) })}
          {props.offline ? t("news.offline") : ""}
        </p>
      )}
      <div className={compact ? "shrink-0" : undefined}>
        <Button
          type="button"
          size={compact ? "default" : "touch"}
          disabled={okay.running || props.offline}
          onClick={() => void seen()}
        >
          {t("news.okay")}
        </Button>
      </div>
      {okay.error && (
        <p role="alert" className="text-destructive">
          {t("news.okayFailed")}
        </p>
      )}
    </>
  );
}

/**
 * "Friends have N new plants: …" (US-SOZ-06): stays until "Okay". What is new is what became visible to me since the last
 * "Okay" (shared, or the friendship started), read through what friends share (P-05); the banner names friend and species only.
 * "Stand: DD.MM.YYYY" tells when the data is from, so an older copy shown without a network is recognizable (FR-SOZ-03).
 * Without news (and on the very first visit) nothing is shown. `quiet` keeps a failed load from adding a second error.
 */
function NewPlantsBanner(props: { api: string; token: Token; quiet?: boolean; compact?: boolean }) {
  const { status, offline, news, okay } = useNewPlants(props.api, props.token);
  if (status === "error")
    return props.quiet ? null : (
      <p role="status" className="rounded-lg border border-border p-3 text-sm">
        {t("news.loadFailed")}
      </p>
    );
  if (!news) return null;
  return (
    <section
      aria-label={t("news.label")}
      className={cn(
        "flex min-w-0 gap-2 rounded-lg border-2 border-primary p-3",
        props.compact ? "flex-wrap items-center gap-x-3 gap-y-1" : "flex-col",
      )}
    >
      <NewPlantsBody
        api={props.api}
        news={news}
        offline={offline}
        okay={okay}
        {...(props.compact ? { compact: true } : {})}
      />
    </section>
  );
}

/**
 * What friends are up to, in one place (US-SOZ-06, US-SOZ-12): the notice about open friendship requests when `requests` is
 * set, then the banner about new plants unless `news` is false ("Heute" shows the new plants as a tile, US-QS-18).
 */
export function FriendsBanner(props: {
  api: string;
  token: Token;
  quiet?: boolean;
  /** Also tell about open friendship requests (US-SOZ-12); the start page does, the page "Freunde" lists them itself. */
  requests?: boolean;
  /** `false` leaves the banner about new plants out (issue 1156). */
  news?: boolean;
  /** One row with "Okay" at its end, for the layer "Neu bei Freunden" (issue 1157). */
  compact?: boolean;
}) {
  return (
    <>
      {props.requests && <RequestsNotice api={props.api} token={props.token} />}
      {props.news !== false && (
        <NewPlantsBanner
          api={props.api}
          token={props.token}
          {...(props.quiet ? { quiet: true } : {})}
          {...(props.compact ? { compact: true } : {})}
        />
      )}
    </>
  );
}
