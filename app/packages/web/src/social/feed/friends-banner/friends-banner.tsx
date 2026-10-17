import { useCallback, useEffect, useRef } from "react";
import type { Banner, BannerItem } from "@pflanzendex/core";
import { Button } from "@/components/ui/button/button";
import { useInvalidate, useRequest, useWriteAction } from "../../../kernel";
import { loadBanner, markFeedSeen } from "../../api/feed-api";
import { dateText } from "../../parts/invite-card/invite-card";
import { nameOf } from "../../parts/request-list/request-list";
import { RequestsNotice } from "../requests-notice/requests-notice";

const KEY = ["social", "banner"] as const;
type Token = () => Promise<string | undefined>;

const speciesText = (i: BannerItem) => i.speciesGerman ?? i.speciesLatin ?? "Art unbekannt";
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
 * "Friends have N new plants: …" (US-SOZ-06): stays until "Okay". What is new is what became visible to me since the last
 * "Okay" (shared, or the friendship started), read through what friends share (P-05); the banner names friend and species only.
 * "Stand: DD.MM.YYYY" tells when the data is from, so an older copy shown without a network is recognizable (FR-SOZ-03).
 * Without news (and on the very first visit) nothing is shown. `quiet` (start page) keeps a failed load from adding a
 * second error to the page: the page "Freunde" says it.
 */
function NewPlantsBanner(props: { api: string; token: Token; quiet?: boolean }) {
  const { api, token } = props;
  const reload = useInvalidate(KEY);
  const load = useCallback((t: string) => loadBanner(api, t), [api]);
  const r = useRequest({ queryKey: KEY, token, load });
  const okay = useWriteAction(token, reload);
  useFirstVisit(api, token, r.value, reload);
  if (r.status === "error")
    return props.quiet ? null : (
      <p role="status" className="rounded-lg border border-border p-3 text-sm">
        Neuigkeiten von Freunden konnten gerade nicht geladen werden.
      </p>
    );
  const banner = r.value;
  if (!banner || banner.firstVisit || banner.count === 0) return null;
  return (
    <section
      aria-label="Neu bei Freunden seit deinem letzten Besuch"
      className="flex min-w-0 flex-col gap-2 rounded-lg border-2 border-primary p-3"
    >
      <p>
        <strong>
          Freunde haben {banner.count} {banner.count === 1 ? "neue Pflanze" : "neue Pflanzen"}:
        </strong>{" "}
        {banner.items.map(itemText).join(", ")}
      </p>
      <p className="text-sm text-muted-foreground">
        Stand: {dateText(banner.asOf)}
        {r.offline ? " (keine Verbindung, zuletzt geladener Stand)" : ""}
      </p>
      <div>
        <Button
          type="button"
          size="touch"
          disabled={okay.running || r.offline}
          onClick={() => void okay.run((t) => markFeedSeen(api, t, banner.asOf), "Okay.")}
        >
          Okay
        </Button>
      </div>
      {okay.error && (
        <p role="alert" className="text-destructive">
          Das hat nicht geklappt. Bitte versuche es noch einmal.
        </p>
      )}
    </section>
  );
}

/**
 * What friends are up to, in one place (US-SOZ-06, US-SOZ-12): the notice about open friendship requests when `requests` is
 * set, then the banner about new plants.
 */
export function FriendsBanner(props: {
  api: string;
  token: Token;
  quiet?: boolean;
  /** Also tell about open friendship requests (US-SOZ-12); the start page does, the page "Freunde" lists them itself. */
  requests?: boolean;
}) {
  return (
    <>
      {props.requests && <RequestsNotice api={props.api} token={props.token} />}
      <NewPlantsBanner
        api={props.api}
        token={props.token}
        {...(props.quiet ? { quiet: true } : {})}
      />
    </>
  );
}
