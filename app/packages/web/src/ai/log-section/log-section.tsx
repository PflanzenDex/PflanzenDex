import { useCallback } from "react";
import { LoadFrame } from "../../kernel";
import { loadLog, type AiLogEntry } from "../api/connections-api";

type Token = () => Promise<string | undefined>;

function Entries({ rows }: { rows: readonly AiLogEntry[] }) {
  if (rows.length === 0) return <p className="m-0">Dein KI-Client hat noch nichts getan.</p>;
  return (
    <ul aria-label="KI-Protokoll" className="m-0 flex list-none flex-col gap-2 p-0">
      {rows.map((row) => (
        <li key={row.id} className="flex flex-col gap-1 rounded-lg border border-border p-3">
          <strong className="break-all">{row.operation}</strong>
          <span className="text-sm">{row.effect}</span>
          <span className="text-sm text-muted-foreground">
            {row.clientName}, {new Date(row.createdAt).toLocaleString("de-DE")}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The log of what connected AI clients did, without content beyond what is necessary (US-KI-10, P-10). */
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
