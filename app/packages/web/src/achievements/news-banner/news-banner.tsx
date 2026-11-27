import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import { useAnnounce } from "@/shared/platform/announcer/context";
import { accountAddress } from "@/shared/patterns/navigation/navigation/navigation";
import { Button } from "@/shared/ui/button";
import { LINE_HIT } from "@/shared/feedback/line-hit";
import { useInvalidate, useRequest, WRITE_SUCCEEDED, newRepeatKey } from "../../shared/data";
import { loadNews, markSeen } from "../achievements-api";
import { ACHIEVEMENT_NAMES } from "../overview/texts";

type Token = () => Promise<string | undefined>;
const NEWS_KEY = ["achievements", "news"] as const;

/**
 * The notice "Erfolg: <name>" (US-ACH-03, F-0070): a single line with the link "Zu den Erfolgen" and "Schließen". It is
 * drawn into `slot`, the place under the title of "Heute" where it takes the summary's place (SG-FEED-05, US-QS-32), so it
 * is never inserted above a page. The live region says what is on screen (4.1.3): once, when the notice first shows in the
 * slot; on a page without the slot nothing shows and nothing is said, and "Heute" shows and says it when it opens. The
 * notice itself is no live region (SG-FEED-02).
 */
function Notice(props: { text: string; slot: HTMLElement | null; onClose: () => void }) {
  // `announce` is the channel's own function: the same one for the life of the provider, so it never re-runs the effect.
  const announce = useAnnounce()?.announce;
  const { text, slot } = props;
  const said = useRef<string | null>(null);
  const shown = slot !== null;
  useEffect(() => {
    if (!shown || said.current === text) return;
    said.current = text;
    announce?.(text);
  }, [announce, text, shown]);
  if (!slot) return null;
  return createPortal(
    <section aria-label="Erfolg" className="flex flex-wrap items-center gap-x-2 text-sm">
      <p className="m-0 font-semibold">{text}</p>
      <Link to={accountAddress("achievements")} className="underline">
        Zu den Erfolgen
      </Link>
      {/* The button keeps its 44 px hit area; the margin keeps its row one text line high, also at 200 % text, where the
          row wraps and a margin in rem would run it under the link above (issue 2466). */}
      <Button variant="plain" size="sm" className={LINE_HIT} onClick={props.onClose}>
        Schließen
      </Button>
    </section>,
    slot,
  );
}

/**
 * The quiet notice "Erfolg: <name>" (US-ACH-03): it appears when an action succeeded and made an achievement new, with
 * a link to the overview. It never blocks anything and needs no confirmation; "Schließen" only hides it. The seen state
 * is written by "Als gesehen markieren" in the overview, so a missed moment stays visible there. The state is created silently on the
 * first evaluation (no flood of notices). Calm mode, a read error or an unknown state show nothing (US-ACH-08); there
 * is no push and no e-mail (FR-ACH-06). Nothing animates (NFR-13).
 */
export function AchievementNewsBanner(props: {
  api: string;
  token: Token;
  /** The line under the title of "Heute" the notice is drawn into; `null` on every other page. */
  slot: HTMLElement | null;
}) {
  const { api, token } = props;
  const load = useCallback((t: string) => loadNews(api, t), [api]);
  const news = useRequest({ queryKey: NEWS_KEY, token, load });
  const reload = useInvalidate(NEWS_KEY);
  // Achievements that were already new when the page opened were missed moments: the overview shows them.
  const known = useRef<Set<string> | null>(null);
  const writing = useRef(false);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    window.addEventListener(WRITE_SUCCEEDED, reload);
    return () => window.removeEventListener(WRITE_SUCCEEDED, reload);
  }, [reload]);

  const value = news.value;
  const due = value && !value.calmMode && value.needsWrite ? value.acknowledge : null;
  useEffect(() => {
    if (due === null || writing.current) return;
    writing.current = true;
    // Silent creation (US-ACH-03): no message; a failure is retried at the next visit.
    void (async () => {
      const t = await token();
      // A per-send key: the mark is silent and idempotent, and a lost answer is marked again at the next visit (US-ACH-03).
      if (t) await markSeen(api, t, due, { key: newRepeatKey() });
      writing.current = false;
      reload();
    })();
  }, [due, api, token, reload]);

  // An unexpected answer is treated like a read error: no banner, no break (US-ACH-03).
  if (!value || value.calmMode || !Array.isArray(value.fresh)) return null;
  if (known.current === null) {
    known.current = new Set(value.fresh.map((f) => f.id));
    return null;
  }
  const announced = value.fresh.filter((f) => !known.current?.has(f.id) && !hidden.has(f.id));
  if (announced.length === 0) return null;
  const names = announced.map((f) => ACHIEVEMENT_NAMES[f.id] ?? f.id).join(", ");
  return (
    <Notice
      text={`Erfolg: ${names}`}
      slot={props.slot}
      onClose={() => setHidden(new Set([...hidden, ...announced.map((f) => f.id)]))}
    />
  );
}
