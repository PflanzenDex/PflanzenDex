import { useCallback } from "react";
import { LAYER_PARAM, Pager } from "@/components/shared/responsive/pager/pager";
import { LoadFrame } from "../../kernel";
import { loadLog, type AiLogEntry } from "../api/connections-api";

type Token = () => Promise<string | undefined>;

function Entries({ rows }: { rows: readonly AiLogEntry[] }) {
  if (rows.length === 0) return <p className="m-0">Dein KI-Client hat noch nichts getan.</p>;
  return (
    <Pager
      items={rows}
      pageSize={3}
      label="KI-Protokoll"
      param={LAYER_PARAM}
      getKey={(row) => row.id}
      renderItem={(row) => (
        <div className="flex flex-col gap-1 rounded-lg border border-border p-3">
          <strong className="break-all">{row.operation}</strong>
          <span className="text-sm">{row.effect}</span>
          <span className="text-sm text-muted-foreground">
            {row.clientName}, {new Date(row.createdAt).toLocaleString("de-DE")}
          </span>
        </div>
      )}
    />
  );
}

/** The log of what connected AI clients did, without content beyond what is necessary (US-KI-10, P-10), in pages. */
export function LogSection(props: { api: string; token: Token }) {
  const load = useCallback((t: string) => loadLog(props.api, t), [props.api]);
  return (
    <LoadFrame
      queryKey={["ai", "log"]}
      token={props.token}
      load={load}
      loadingText="Protokoll wird geladen …"
    >
      {(rows) => <Entries rows={rows} />}
    </LoadFrame>
  );
}
