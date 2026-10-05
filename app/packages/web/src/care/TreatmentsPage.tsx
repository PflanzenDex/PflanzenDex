import { useCallback, useRef, useState } from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { RequestState } from "@/components/shared/states/request-state/request-state";
import { SIGN_IN, useInvalidate, useRequest, type ApiError, type Request } from "../kernel";
import { OPEN_KEY, SPECIMENS_KEY } from "./api/query-keys";
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
  request: Request<readonly TreatableSpecimen[]>;
  planning: ReturnType<typeof usePlanning>;
  focusRef: React.MutableRefObject<HTMLInputElement | null>;
}) {
  const { request, planning } = props;
  const specimens = request.value ?? [];
  return (
    <RequestState
      status={request.status === "ready" && specimens.length === 0 ? "empty" : request.status}
      {...(request.error ? { errorText: request.error.text } : {})}
      onRetry={request.retry}
      skeleton={<TreatmentFormSkeleton label={LOADING} />}
      empty={
        <EmptyState
          title="Du hast noch kein Exemplar."
          description="Lege zuerst ein Exemplar im Bestand an."
          action={{ label: "Zum Bestand", href: "/collection" }}
        />
      }
      offline={request.offline}
    >
      {planning.message && <StatusNote>{planning.message}</StatusNote>}
      {planning.error && <RefusalAlert error={planning.error} />}
      <TreatmentForm
        specimens={specimens}
        running={planning.running}
        onSend={planning.send}
        focusRef={props.focusRef}
      />
    </RequestState>
  );
}

/**
 * Treatments: the open dates by urgency with "Erledigt" (US-BEH-02, US-BEH-03), the form to plan new ones, one date or
 * a course (US-BEH-01), and the done ones per specimen as history (US-BEH-03).
 * Every view says what to do next (P-09): without a specimen it points to the collection, after saving the list above
 * shows the new date.
 */
export function TreatmentsPage(props: { api: string; token: Token }) {
  const { api, token } = props;
  const firstField = useRef<HTMLInputElement | null>(null);
  const load = useCallback((t: string) => loadTreatableSpecimens(api, t), [api]);
  const request = useRequest({ queryKey: SPECIMENS_KEY, token, load });
  // The list of open treatments loads again after every successful plan (US-BEH-02).
  const onPlanned = useInvalidate(OPEN_KEY);
  const planning = usePlanning(api, token, onPlanned);
  const specimens = request.value ?? [];
  const canPlan = specimens.length > 0;
  return (
    <section aria-labelledby="treatments-title" className="flex min-w-0 flex-col gap-6">
      <h1 id="treatments-title" className="text-2xl font-semibold">
        Behandlung
      </h1>
      <OpenTreatments
        api={api}
        token={token}
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
        <Planning request={request} planning={planning} focusRef={firstField} />
      </section>
      {canPlan && <TreatmentHistory api={api} token={token} specimens={specimens} />}
    </section>
  );
}
