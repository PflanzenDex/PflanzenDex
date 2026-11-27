import { useCallback } from "react";
import type { HistoryEntry } from "@pflanzendex/core";
import { ScrollEntries } from "@/shared/patterns/responsive/entry-list/paging/scroll-entries/scroll-entries";
import { EmptySection } from "@/shared/patterns/elements/empty-state/empty-section/empty-section";
import { currentTimeZone } from "../../../shared/data";
import { LoadFrame } from "@/shared/patterns/states/request-state/load-frame/load-frame";
import { loadHistory } from "../../api/swaps-api";
import { useCardPageSize } from "@/shared/patterns/responsive/entry-list/card-page-size";
import { MODE_TEXT, TYPE_TEXT } from "../offer-form/health-text";
import { CAUSE_TEXT } from "../swap-requests/swap-text";
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

/**
 * The line of an entry worded from its outcome (US-SOZ-13, SG-COPY-03): only a handover says a plant changed hands; a
 * declined, withdrawn or broken-off swap says what happened to the request. It replaces the status badge.
 */
export function outcomeLine(e: Pick<HistoryEntry, "status" | "direction">, who: string): string {
  switch (e.status) {
    case "handed_over":
      return t(
        e.direction === "given" ? "history.handedOver.given" : "history.handedOver.received",
        { who },
      );
    case "declined":
      return t(e.direction === "given" ? "history.declined.given" : "history.declined.received", {
        who,
      });
    case "withdrawn":
      return t(e.direction === "given" ? "history.withdrawn.given" : "history.withdrawn.received", {
        who,
      });
    case "canceled":
      return t("history.canceled", { who });
    default:
      return t("history.open", { who });
  }
}

function Entry({ e }: { e: HistoryEntry }) {
  const who = e.friend ?? t("history.someone");
  return (
    <div className="grid min-w-0 gap-1 break-words rounded-lg border border-border p-3">
      <span className="text-sm text-muted-foreground">{dayText(e.date)}</span>
      <span className="font-semibold">{e.species ?? t("history.speciesUnknown")}</span>
      <span className="text-sm">{outcomeLine(e, who)}</span>
      <span className="text-sm">
        {TYPE_TEXT[e.type]} · {MODE_TEXT[e.mode]}
      </span>
      {e.cause && <span className="text-sm text-muted-foreground">{CAUSE_TEXT[e.cause]}.</span>}
      {e.reason && (
        <span className="text-sm text-muted-foreground">
          {t("history.reason", { reason: e.reason })}
        </span>
      )}
    </div>
  );
}

/**
 * The swap history (US-SOZ-13): completed and ended swaps with date, species and the outcome with the friend. The
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
            <EmptySection text={t("history.none")} />
          ) : (
            <ScrollEntries
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
