import { useCallback, useEffect, useRef, useState } from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadError, SIGN_IN, type ApiError } from "../kernel";
import { OpenTreatments } from "./open-treatments";
import { RefusalAlert, StatusNote } from "./notices";
import { TreatmentHistory } from "./treatment-history";
import { TreatmentForm } from "./treatment-form";
import { TreatmentFormSkeleton } from "./TreatmentsPage.skeleton";
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
function usePlanning(api: string, token: Token, onPlanned: () => void) {
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
      if (r.ok) onPlanned();
      return r.ok;
    },
    [api, token, onPlanned],
  );
  return { running, message, error, send };
}

const LOADING = "Exemplare werden geladen …";

/** The form to plan, with what the last attempt said; without a specimen it points to the collection (P-09). */
function Planning(props: {
  data: Data;
  planning: ReturnType<typeof usePlanning>;
  onReload: () => void;
  focusRef: React.MutableRefObject<HTMLInputElement | null>;
}) {
  const { data, planning } = props;
  if (data.kind === "loading") return <TreatmentFormSkeleton label={LOADING} />;
  if (data.kind === "error") return <LoadError error={data.error} onReload={props.onReload} />;
  if (data.specimens.length === 0)
    return (
      <EmptyState
        title="Du hast noch kein Exemplar."
        description="Lege zuerst ein Exemplar im Bestand an."
        action={{ label: "Zum Bestand", href: "/collection" }}
      />
    );
  return (
    <>
      {planning.message && <StatusNote>{planning.message}</StatusNote>}
      {planning.error && <RefusalAlert error={planning.error} />}
      <TreatmentForm
        specimens={data.specimens}
        running={planning.running}
        onSend={planning.send}
        focusRef={props.focusRef}
      />
    </>
  );
}

/**
 * Treatments: the open dates by urgency with "Erledigt" (US-BEH-02, US-BEH-03), the form to plan new ones, one date or
 * a course (US-BEH-01), and the done ones per specimen as history (US-BEH-03).
 * Every view says what to do next (P-09): without a specimen it points to the collection, after saving the list above
 * shows the new date.
 */
export function TreatmentsPage(props: { api: string; token: Token }) {
  const [reload, setReload] = useState(0);
  // The list of open treatments loads again after every successful plan (US-BEH-02).
  const [planned, setPlanned] = useState(0);
  // The history loads again after every tick-off (US-BEH-03).
  const [ticked, setTicked] = useState(0);
  const firstField = useRef<HTMLInputElement | null>(null);
  const data = useSpecimens(props.api, props.token, reload);
  const onPlanned = useCallback(() => setPlanned((n) => n + 1), []);
  const onTicked = useCallback(() => setTicked((n) => n + 1), []);
  const planning = usePlanning(props.api, props.token, onPlanned);
  const canPlan = data.kind === "da" && data.specimens.length > 0;
  return (
    <section aria-labelledby="treatments-title" className="flex min-w-0 flex-col gap-6">
      <h1 id="treatments-title" className="text-2xl font-semibold">
        Behandlung
      </h1>
      <OpenTreatments
        api={props.api}
        token={props.token}
        version={planned}
        onChanged={onTicked}
        next={
          canPlan
            ? { label: "Behandlung planen", onClick: () => firstField.current?.focus() }
            : { label: "Zum Bestand", href: "/collection" }
        }
      />
      <section aria-labelledby="plan-title" className="flex flex-col gap-3">
        <h2 id="plan-title" className="text-xl font-semibold">
          Behandlung planen
        </h2>
        <Planning
          data={data}
          planning={planning}
          onReload={() => setReload((n) => n + 1)}
          focusRef={firstField}
        />
      </section>
      {data.kind === "da" && data.specimens.length > 0 && (
        <TreatmentHistory
          api={props.api}
          token={props.token}
          specimens={data.specimens}
          version={planned + ticked}
        />
      )}
    </section>
  );
}
