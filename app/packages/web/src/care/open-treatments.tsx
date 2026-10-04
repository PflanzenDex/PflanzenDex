import type { TreatmentListRow } from "@pflanzendex/core";
import { useEffect, useState } from "react";
import { LoadError, SIGN_IN, type ApiError } from "../kernel";
import { loadOpenTreatments } from "./treatments-api";
import { dateText } from "./text";

type Token = () => Promise<string | undefined>;
type Data =
  | { kind: "loading" }
  | { kind: "error"; error: ApiError }
  | { kind: "da"; rows: readonly TreatmentListRow[] };

/** Loads the open treatments again whenever `version` changes (after planning, or "Erneut laden"). */
function useOpenTreatments(api: string, token: Token, version: number): Data {
  const [data, setData] = useState<Data>({ kind: "loading" });
  useEffect(() => {
    let current = true;
    void (async () => {
      const t = await token();
      const r = t ? await loadOpenTreatments(api, t) : { ok: false as const, error: SIGN_IN };
      if (current)
        setData(r.ok ? { kind: "da", rows: r.value } : { kind: "error", error: r.error });
    })();
    return () => {
      current = false;
    };
  }, [api, token, version]);
  return data;
}

/** One sentence that says what to do next (P-09): the overdue and the due-today dates first. */
export function nextStepText(rows: readonly TreatmentListRow[]): string | null {
  const overdue = rows.filter((r) => r.status.kind === "overdue").length;
  const today = rows.filter((r) => r.status.kind === "today").length;
  if (overdue === 0 && today === 0) return null;
  const parts = [];
  if (overdue > 0)
    parts.push(overdue === 1 ? "1 Termin ist überfällig" : `${overdue} Termine sind überfällig`);
  if (today > 0) parts.push(today === 1 ? "1 ist heute fällig" : `${today} sind heute fällig`);
  return `${parts.join(", ")}. Behandle diese Exemplare zuerst.`;
}

function Row({ row }: { row: TreatmentListRow }) {
  return (
    <li className={`entry treatment-${row.status.kind}`}>
      <h3>{row.specimenName}</h3>
      <p className="quiet">Grund: {row.reason}</p>
      <p className="quiet">Mittel: {row.agent ?? "—"}</p>
      <p className="quiet">Fällig am: {dateText(row.dueAt)}</p>
      <p className="status-text">{row.status.text}</p>
    </li>
  );
}

/**
 * The open treatments by urgency (US-BEH-02): earliest first (the server sorts), status as text, never by colour
 * alone. Without any, the view says so and what to do next (P-09).
 */
export function OpenTreatments(props: { api: string; token: Token; version: number }) {
  const [reload, setReload] = useState(0);
  const data = useOpenTreatments(props.api, props.token, props.version + reload);
  const next = data.kind === "da" ? nextStepText(data.rows) : null;
  return (
    <section aria-labelledby="open-treatments-title" className="open-treatments">
      <h2 id="open-treatments-title">Offene Behandlungen</h2>
      {data.kind === "loading" && <p>Offene Behandlungen werden geladen …</p>}
      {data.kind === "error" && (
        <LoadError error={data.error} onReload={() => setReload((n) => n + 1)} />
      )}
      {data.kind === "da" && data.rows.length === 0 && (
        <div className="empty">
          <p>Keine offenen Behandlungen.</p>
          <p>Plane unten einen Termin, dann erscheint er hier.</p>
        </div>
      )}
      {data.kind === "da" && data.rows.length > 0 && (
        <>
          {next && <p className="hint">{next}</p>}
          <ul className="list" aria-label="Offene Behandlungen">
            {data.rows.map((row) => (
              <Row key={row.id} row={row} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
