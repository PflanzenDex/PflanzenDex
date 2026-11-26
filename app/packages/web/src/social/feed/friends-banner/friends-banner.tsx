import { localToday, type Banner, type BannerItem } from "@pflanzendex/core";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";
import { summaryDate } from "@/shared/lib/format";
import { refusalText } from "@/shared/lib/error-text";
import { texts } from "@/shared/lib/text-rules/texts";
import { currentTimeZone } from "../../../shared/data";
import { markFeedSeen } from "../../api/feed-api";
import { useNewPlants, type Token } from "./use-new-plants";
import { nameOf } from "../../parts/request-list/request-list";
import { RequestsNotice } from "../requests-notice/requests-notice";
import table from "../../social.de.json";

const t = texts(table);

export const speciesText = (i: BannerItem) =>
  i.speciesGerman ?? i.speciesLatin ?? t("news.speciesUnknown");
export const itemText = (i: BannerItem) =>
  `${nameOf(i.friendName)}: ${i.count} × ${speciesText(i)}`;

/**
 * The headline of what is new (US-SOZ-06): "Freunde haben N neue Pflanzen: …". The banner shows it only with news; the
 * layer on "Heute" writes its own line when only read plants are left. `compact` is one row with the button (issue 1157).
 */
export function NewPlantsHeadline(props: { news: Banner; compact?: boolean }) {
  const { news, compact } = props;
  return (
    <p className={compact ? "min-w-0 flex-1 basis-48" : undefined}>
      <strong>
        {news.count === 1
          ? t("news.headline.one")
          : t("news.headline.other", { count: news.count })}
      </strong>{" "}
      {news.items.map(itemText).join(", ")}
    </p>
  );
}

/**
 * "Stand" of a copy (US-QS-32, FR-SOZ-03): only for a copy older than today, in calendar days of the keeper's zone; without
 * a network it always shows, with the note about the missing connection, so an old copy stays recognizable. `compact` leaves
 * it out while online, for a place that says "Stand" itself (issue 1157).
 */
export function NewPlantsAsOf(props: { news: Banner; offline: boolean; compact?: boolean }) {
  const { news, offline, compact } = props;
  const zone = currentTimeZone();
  const copyDay = localToday(new Date(news.asOf), zone);
  const today = localToday(new Date(), zone);
  if (!(offline || (!compact && copyDay < today))) return null;
  return (
    <p className="text-sm text-muted-foreground">
      {t("news.asOf", { date: summaryDate(copyDay, today) })}
      {offline ? t("news.offline") : ""}
    </p>
  );
}

/**
 * What is new, and "Als gelesen markieren" (US-SOZ-06): the banner on "Freunde" with its button. `onSeen` follows a successful
 * "Als gelesen markieren". `compact` is one row with the button at its end, for the layer "Neu bei Freunden" of "Freunde"
 * (owner decision 2026-11-02, issue 1157).
 */
export function NewPlantsBody(props: {
  api: string;
  news: Banner;
  offline: boolean;
  okay: ReturnType<typeof useNewPlants>["okay"];
  onSeen?: () => void;
  compact?: boolean;
}) {
  const { news, okay, compact, offline } = props;
  const seen = async () => {
    // The feed mark is a background write: its own key, it frees no held key of the page (US-QS-03).
    await okay.runSilent(
      (tk, opts) => markFeedSeen(props.api, tk, news.asOf, opts),
      t("news.okayDone"),
    );
    props.onSeen?.();
  };
  return (
    <>
      <NewPlantsHeadline news={news} {...(compact ? { compact: true } : {})} />
      <NewPlantsAsOf news={news} offline={offline} {...(compact ? { compact: true } : {})} />
      <div>
        <Button
          type="button"
          size={compact ? "default" : "touch"}
          {...(compact ? { variant: "tinted" as const } : {})}
          disabled={okay.running || offline}
          onClick={() => void seen()}
        >
          {t("news.okay")}
        </Button>
      </div>
      {okay.error && (
        <p role="alert" className="text-destructive">
          {refusalText(okay.error)}
        </p>
      )}
    </>
  );
}

/**
 * "Friends have N new plants: …" (US-SOZ-06): stays until "Als gelesen markieren". What is new is what became visible to me since the last
 * "Als gelesen markieren" (shared, or the friendship started), read through what friends share (P-05); the banner names friend and species only.
 * "Stand: gestern" (or "vor 3 Tagen", else the date) tells when an older copy is from; a copy of today has no "Stand", and without a
 * network it always shows, so an old copy stays recognizable (FR-SOZ-03, US-QS-32).
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
  /** One row with "Als gelesen markieren" at its end, for the layer "Neu bei Freunden" (issue 1157). */
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
