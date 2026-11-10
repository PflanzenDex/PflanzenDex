import { useCallback } from "react";
import type { HistoryEntry } from "@pflanzendex/core";
import { Pager } from "@/shared/patterns/responsive/pager/pager";
import { Badge } from "@/shared/ui/display/badge/badge";
import { currentTimeZone, LoadFrame } from "../../../shared/data";
import { loadHistory } from "../../api/swaps-api";
import { useCardPageSize } from "@/shared/patterns/responsive/pager/card-page-size";
import { MODE_TEXT, TYPE_TEXT } from "../offer-form/health-text";
import { CAUSE_TEXT, STATUS_TEXT } from "../swap-requests/swap-text";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "../../swap.de.json";
import { SwapHistorySkeleton } from "./swap-history.skeleton";

const t = texts(table);

const KEY = ["swap", "history"] as const;
type Token = () => Promise<string | undefined>;

/** The date as the keeper's local calendar date (NFR-08), not the UTC date of the instant. */
const dayText = (iso: string): string =>
  new Intl.DateTimeFormat("de-DE", { timeZone: currentTimeZone(), dateStyle: "medium" }).format(
    new Date(iso),
  );

function Entry({ e }: { e: HistoryEntry }) {
  const who = e.friend ?? t("history.someone");
  return (
    <div className="grid min-w-0 gap-1 break-words rounded-lg border border-border p-3">
      <span className="text-sm text-muted-foreground">{dayText(e.date)}</span>
      <span className="font-semibold">{e.species ?? t("history.speciesUnknown")}</span>
      <span className="text-sm">
        {e.direction === "given" ? t("history.given", { who }) : t("history.received", { who })}
      </span>
      <span className="text-sm">
        {TYPE_TEXT[e.type]} · {MODE_TEXT[e.mode]}
      </span>
      {e.cause && <span className="text-sm text-muted-foreground">{CAUSE_TEXT[e.cause]}.</span>}
      {e.reason && (
        <span className="text-sm text-muted-foreground">
          {t("history.reason", { reason: e.reason })}
        </span>
      )}
      <span className="mt-1">
        <Badge variant={e.status === "handed_over" ? "default" : "outline"}>
          {STATUS_TEXT[e.status]}
        </Badge>
      </span>
    </div>
  );
}

/**
 * The swap history (US-SOZ-13): completed and ended swaps with date, friend, given or received, species and status. The
 * friend is the name stored at the request, so the history stays after the friendship ended. Nothing disappears (P-10);
 * without entries the section says what it is for (P-09).
 */
export function SwapHistory(props: { api: string; token: Token }) {
  const { api, token } = props;
  const size = useCardPageSize();
  const load = useCallback((t: string) => loadHistory(api, t), [api]);
  return (
    <section
      aria-labelledby="swap-history-title"
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-3"
    >
      <h2 id="swap-history-title" className="sr-only">
        {t("history.title")}
      </h2>
      <LoadFrame
        queryKey={KEY}
        token={token}
        load={load}
        loadingText={t("history.loading")}
        loadingFallback={<SwapHistorySkeleton label={t("history.loading")} />}
      >
        {(data: { entries: readonly HistoryEntry[] }) =>
          data.entries.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-3">{t("history.none")}</p>
          ) : (
            <Pager
              items={data.entries}
              pageSize={size}
              fit
              label={t("history.title")}
              getKey={(e) => e.swapId}
              renderItem={(e) => <Entry e={e} />}
            />
          )
        }
      </LoadFrame>
    </section>
  );
}
