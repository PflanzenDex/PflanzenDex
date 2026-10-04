import type { TreatmentRow } from "@pflanzendex/core";
import { useEffect, useState } from "react";
import { LoadError, SIGN_IN, type ApiError } from "../kernel";
import { dateText } from "./text";
import { loadTreatmentHistory, type TreatableSpecimen } from "./treatments-api";

type Token = () => Promise<string | undefined>;
type Data =
  | { kind: "loading" }
  | { kind: "error"; error: ApiError }
  | { kind: "da"; rows: readonly TreatmentRow[] };

/** Loads the done treatments of the chosen specimen; again whenever `version` changes (after a tick-off). */
function useHistory(api: string, token: Token, specimenId: string, version: number): Data {
  const [data, setData] = useState<Data>({ kind: "loading" });
  useEffect(() => {
    let current = true;
    void (async () => {
      const t = await token();
      const r = t
        ? await loadTreatmentHistory(api, t, specimenId)
        : { ok: false as const, error: SIGN_IN };
      if (current)
        setData(r.ok ? { kind: "da", rows: r.value } : { kind: "error", error: r.error });
    })();
    return () => {
      current = false;
    };
  }, [api, token, specimenId, version]);
  return data;
}

function Entry({ row }: { row: TreatmentRow }) {
  return (
    <li className="entry">
      <h3>{row.reason}</h3>
      <p className="quiet">Mittel: {row.agent ?? "—"}</p>
      <p className="quiet">Fällig am: {dateText(row.dueAt)}</p>
      <p className="quiet">Erledigt am: {row.doneAt ? dateText(row.doneAt) : "unbekannt"}</p>
    </li>
  );
}

function History(props: { api: string; token: Token; specimen: string; version: number }) {
  const [reload, setReload] = useState(0);
  const data = useHistory(props.api, props.token, props.specimen, props.version + reload);
  if (data.kind === "loading") return <p role="status">Verlauf wird geladen …</p>;
  if (data.kind === "error")
    return <LoadError error={data.error} onReload={() => setReload((n) => n + 1)} />;
  if (data.rows.length === 0)
    return (
      <div className="empty">
        <p>Noch keine erledigte Behandlung für dieses Exemplar.</p>
        <p>Hake oben einen offenen Termin mit „Erledigt“ ab, dann erscheint er hier.</p>
      </div>
    );
  return (
    <ul className="list" aria-label="Erledigte Behandlungen">
      {data.rows.map((row) => (
        <Entry key={row.id} row={row} />
      ))}
    </ul>
  );
}

/**
 * The completed treatments of one specimen (US-BEH-03: they remain as history). Nothing is loaded before a specimen
 * is chosen; the view says what to do (P-09).
 */
export function TreatmentHistory(props: {
  api: string;
  token: Token;
  specimens: readonly TreatableSpecimen[];
  version: number;
}) {
  const [specimen, setSpecimen] = useState("");
  return (
    <section aria-labelledby="treatment-history-title" className="treatment-history">
      <h2 id="treatment-history-title">Erledigte Behandlungen</h2>
      <label>
        Exemplar für den Verlauf
        <select value={specimen} onChange={(e) => setSpecimen(e.target.value)}>
          <option value="">Exemplar wählen …</option>
          {props.specimens.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      {specimen === "" ? (
        <p className="hint">Wähle ein Exemplar, um erledigte Behandlungen zu sehen.</p>
      ) : (
        <History api={props.api} token={props.token} specimen={specimen} version={props.version} />
      )}
    </section>
  );
}
