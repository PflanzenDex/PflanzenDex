import { useCallback } from "react";
import type { HistoryEntry } from "@pflanzendex/core";
import { Badge } from "@/components/ui/display/badge/badge";
import { currentTimeZone, LoadFrame } from "../../../kernel";
import { loadHistory } from "../../api/swaps-api";
import { MODE_TEXT, TYPE_TEXT } from "../offer-form/health-text";
import { CAUSE_TEXT, STATUS_TEXT } from "../swap-requests/swap-text";

const KEY = ["swap", "history"] as const;
type Token = () => Promise<string | undefined>;

/** The date as the keeper's local calendar date (NFR-08), not the UTC date of the instant. */
const dayText = (iso: string): string =>
  new Intl.DateTimeFormat("de-DE", { timeZone: currentTimeZone(), dateStyle: "medium" }).format(
    new Date(iso),
  );

function Entry({ e }: { e: HistoryEntry }) {
  const who = e.friend ?? "einem Freund";
  return (
    <li className="grid min-w-0 gap-1 break-words rounded-lg border border-border p-3">
      <span className="text-sm text-muted-foreground">{dayText(e.date)}</span>
      <span className="font-semibold">{e.species ?? "Art unbekannt"}</span>
      <span className="text-sm">
        {e.direction === "given" ? `Gegeben an ${who}` : `Erhalten von ${who}`}
      </span>
      <span className="text-sm">
        {TYPE_TEXT[e.type]} · {MODE_TEXT[e.mode]}
      </span>
      {e.cause && <span className="text-sm text-muted-foreground">{CAUSE_TEXT[e.cause]}.</span>}
      {e.reason && <span className="text-sm text-muted-foreground">Grund: {e.reason}</span>}
      <span className="mt-1">
        <Badge variant={e.status === "handed_over" ? "default" : "outline"}>
          {STATUS_TEXT[e.status]}
        </Badge>
      </span>
    </li>
  );
}

/**
 * The swap history (US-SOZ-13): completed and ended swaps with date, friend, given or received, species and status. The
 * friend is the name stored at the request, so the history stays after the friendship ended. Nothing disappears (P-10);
 * without entries the section says what it is for (P-09).
 */
export function SwapHistory(props: { api: string; token: Token }) {
  const { api, token } = props;
  const load = useCallback((t: string) => loadHistory(api, t), [api]);
  return (
    <section aria-labelledby="swap-history-title" className="flex min-w-0 flex-col gap-3">
      <h2 id="swap-history-title" className="text-xl font-semibold">
        Tauschverlauf
      </h2>
      <LoadFrame
        queryKey={KEY}
        token={token}
        load={load}
        loadingText="Tauschverlauf wird geladen …"
      >
        {(data: { entries: readonly HistoryEntry[] }) =>
          data.entries.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-3">
              Noch kein Tausch abgeschlossen. Hier stehen später alle Übergaben und beendeten
              Anfragen, auch wenn die Freundschaft endet.
            </p>
          ) : (
            <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0" aria-label="Tauschverlauf">
              {data.entries.map((e) => (
                <Entry key={e.swapId} e={e} />
              ))}
            </ul>
          )
        }
      </LoadFrame>
    </section>
  );
}
