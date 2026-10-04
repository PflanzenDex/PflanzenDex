import "./care.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { LoadError, SIGN_IN, type ApiError } from "../kernel";
import { TreatmentForm } from "./treatment-form";
import { treatmentsPlannedText } from "./text";
import {
  loadTreatableSpecimens,
  planTreatments,
  type TreatableSpecimen,
  type TreatmentInput,
} from "./treatments-api";

type Token = () => Promise<string | undefined>;
type Data =
  | { kind: "loading" }
  | { kind: "error"; error: ApiError }
  | { kind: "da"; specimens: readonly TreatableSpecimen[] };

function useSpecimens(api: string, token: Token, reload: number): Data {
  const [data, setData] = useState<Data>({ kind: "loading" });
  useEffect(() => {
    let current = true;
    void (async () => {
      const t = await token();
      const r = t ? await loadTreatableSpecimens(api, t) : { ok: false as const, error: SIGN_IN };
      if (current)
        setData(r.ok ? { kind: "da", specimens: r.value } : { kind: "error", error: r.error });
    })();
    return () => {
      current = false;
    };
  }, [api, token, reload]);
  return data;
}

/** One request at a time (a double tap sends one); a refusal stays visible, a success says what was planned. */
function usePlanning(api: string, token: Token) {
  const busy = useRef(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const send = useCallback(
    async (input: TreatmentInput): Promise<boolean> => {
      if (busy.current) return false;
      busy.current = true;
      setRunning(true);
      const t = await token();
      const r = t ? await planTreatments(api, t, input) : { ok: false as const, error: SIGN_IN };
      busy.current = false;
      setRunning(false);
      setError(r.ok ? null : r.error);
      setMessage(r.ok ? treatmentsPlannedText(r.value) : null);
      return r.ok;
    },
    [api, token],
  );
  return { running, message, error, send };
}

/**
 * Plan treatments (US-BEH-01): the form for one date or a course. Every view says what to do next (P-09): without a
 * specimen it points to the collection, after saving to the cards where the next date shows.
 */
export function TreatmentsPage(props: { api: string; token: Token }) {
  const [reload, setReload] = useState(0);
  const data = useSpecimens(props.api, props.token, reload);
  const planning = usePlanning(props.api, props.token);
  return (
    <div className="light treatments">
      <section aria-labelledby="treatments-title">
        <h1 id="treatments-title">Behandlung planen</h1>
        {data.kind === "loading" && <p role="status">Exemplare werden geladen …</p>}
        {data.kind === "error" && (
          <LoadError error={data.error} onReload={() => setReload((n) => n + 1)} />
        )}
        {data.kind === "da" && data.specimens.length === 0 && (
          <p>Du hast noch kein Exemplar. Lege zuerst ein Exemplar im Bestand an.</p>
        )}
        {data.kind === "da" && data.specimens.length > 0 && (
          <>
            {planning.message && (
              <p role="status" className="hint">
                {planning.message}
              </p>
            )}
            {planning.error && (
              <div role="alert" className="warning">
                <p>{planning.error.text}</p>
              </div>
            )}
            <TreatmentForm
              specimens={data.specimens}
              running={planning.running}
              onSend={planning.send}
            />
          </>
        )}
      </section>
    </div>
  );
}
