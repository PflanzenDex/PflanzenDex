import { useCallback } from "react";
import { Button } from "@/components/ui/button/button";
import { LoadFrame, useInvalidate, useWriteAction } from "../../kernel";
import { adoptDraft, discardDraft, loadDrafts, type AiDraftRow } from "../api/connections-api";

type Token = () => Promise<string | undefined>;
const KEY = ["ai", "drafts"] as const;

const TYPE_TEXT: Record<string, string> = { wish: "Wunsch", species: "Artprofil" };
const STATUS_TEXT: Record<AiDraftRow["status"], string> = {
  open: "Offen",
  adopted: "Übernommen",
  discarded: "Verworfen",
  expired: "Abgelaufen",
};

const title = (d: AiDraftRow) => {
  const content = d.content as { name?: unknown; latinName?: unknown } | null;
  const label = content?.name ?? content?.latinName;
  const name = typeof label === "string" ? label : "";
  return `${TYPE_TEXT[d.type] ?? d.type}${name ? `: ${name}` : ""}`;
};

function Draft(props: {
  api: string;
  row: AiDraftRow;
  busy: boolean;
  run: ReturnType<typeof useWriteAction>["run"];
}) {
  const { api, row, busy, run } = props;
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <strong className="break-all">{title(row)}</strong>
        <span>{STATUS_TEXT[row.status]}</span>
      </div>
      <p className="m-0 text-sm text-muted-foreground">
        KI-Entwurf von {row.clientName}, noch nicht geprüft. Quelle:{" "}
        <span className="break-all">{row.source}</span>
      </p>
      {row.status === "open" && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={busy}
            aria-label={`${title(row)} übernehmen`}
            onClick={() =>
              void run((t) => adoptDraft(api, t, row.id), "Der Entwurf ist übernommen.")
            }
          >
            Übernehmen
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            aria-label={`${title(row)} verwerfen`}
            onClick={() =>
              void run((t) => discardDraft(api, t, row.id), "Der Entwurf ist verworfen.")
            }
          >
            Verwerfen
          </Button>
        </div>
      )}
    </li>
  );
}

function List(props: { api: string; token: Token; rows: readonly AiDraftRow[] }) {
  const again = useInvalidate(KEY);
  const write = useWriteAction(props.token, again);
  return (
    <div className="flex max-w-xl flex-col gap-3">
      <p className="m-0 text-sm text-muted-foreground">
        Ergebnisse deines KI-Clients zählen erst, wenn du sie übernimmst. Offene Entwürfe verfallen
        nach 14 Tagen und bleiben danach sichtbar.
      </p>
      {props.rows.length === 0 ? (
        <p className="m-0">Keine Entwürfe vorhanden.</p>
      ) : (
        <ul aria-label="KI-Entwürfe" className="m-0 flex list-none flex-col gap-2 p-0">
          {props.rows.map((row) => (
            <Draft key={row.id} api={props.api} row={row} busy={write.running} run={write.run} />
          ))}
        </ul>
      )}
      {write.error && (
        <p role="alert" className="rounded-lg border border-destructive p-3">
          {write.error.text}
        </p>
      )}
      {write.message && (
        <p role="status" className="rounded-lg border border-border p-3">
          {write.message}
        </p>
      )}
    </div>
  );
}

/** The inbox "Entwürfe" of the AI client's results (US-KI-09): adopt or discard each one (KI-R3). */
export function DraftsSection(props: { api: string; token: Token }) {
  const load = useCallback((t: string) => loadDrafts(props.api, t), [props.api]);
  return (
    <LoadFrame
      queryKey={KEY}
      token={props.token}
      load={load}
      loadingText="Entwürfe werden geladen …"
    >
      {(rows) => <List api={props.api} token={props.token} rows={rows} />}
    </LoadFrame>
  );
}
