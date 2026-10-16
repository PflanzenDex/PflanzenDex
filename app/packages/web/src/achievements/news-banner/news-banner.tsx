import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { accountAddress } from "@/components/shared/navigation/nav-model/navigation/navigation";
import { Button } from "@/components/ui/button/button";
import { useInvalidate, useRequest, WRITE_SUCCEEDED } from "../../kernel";
import { loadNews, markSeen } from "../achievements-api";
import { ACHIEVEMENT_NAMES } from "../overview/texts";

type Token = () => Promise<string | undefined>;
const NEWS_KEY = ["achievements", "news"] as const;

/**
 * The quiet banner "Erfolg: <name>" (US-ACH-03): it appears when an action succeeded and made an achievement new, with
 * a link to the overview. It never blocks anything and needs no confirmation; "Schließen" only hides it. The seen state
 * is written by "Okay" in the overview, so a missed moment stays visible there. The state is created silently on the
 * first evaluation (no flood of banners). Calm mode, a read error or an unknown state show nothing (US-ACH-08); there
 * is no push and no e-mail (FR-ACH-06). The text is a status for assistive technology; nothing animates (NFR-13).
 */
export function AchievementNewsBanner(props: { api: string; token: Token }) {
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
      if (t) await markSeen(api, t, due);
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
    <section
      role="status"
      aria-label="Erfolg"
      className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-primary p-3"
    >
      <p className="m-0 font-semibold">{`Erfolg: ${names}`}</p>
      <Link to={accountAddress("achievements")} className="underline">
        Zu den Erfolgen
      </Link>
      <Button
        variant="outline"
        onClick={() => setHidden(new Set([...hidden, ...announced.map((f) => f.id)]))}
      >
        Schließen
      </Button>
    </section>
  );
}
