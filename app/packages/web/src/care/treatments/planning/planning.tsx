import { useCallback, useRef, useState } from "react";
import { EmptyState } from "@/components/shared/empty-state/empty-state";
import { RequestState } from "@/components/shared/states/request-state/request-state";
import { SIGN_IN, type ApiError, type Request } from "../../../kernel";
import { RefusalAlert, StatusNote } from "../../shared/notices/notices";
import { TreatmentForm } from "../treatment-form/treatment-form";
import { TreatmentFormSkeleton } from "../treatments-page/treatments-page.skeleton";
import { treatmentsPlannedText } from "../../shared/text";
import {
  planTreatments,
  type TreatableSpecimen,
  type TreatmentInput,
} from "../../shared/api/treatments-api";

type Token = () => Promise<string | undefined>;
/**
 * One request at a time (a double tap sends one); a refusal stays visible, a success says what was planned (`onPlanned`
 * gets that text, so a layer that closes after the save can still confirm it).
 */
export function usePlanning(api: string, token: Token, onPlanned: (message: string) => void) {
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
      const text = r.ok ? treatmentsPlannedText(r.value) : null;
      setMessage(text);
      if (text !== null) onPlanned(text);
      return r.ok;
    },
    [api, token, onPlanned],
  );
  /** Forgets the last attempt (a closed layer must not show an old refusal when it opens again). */
  const reset = useCallback(() => {
    setMessage(null);
    setError(null);
  }, []);
  return { running, message, error, send, reset };
}

const LOADING = "Pflanzen werden geladen …";

/** The form to plan, with what the last attempt said; without a specimen it points to the collection (P-09). */
export function Planning(props: {
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
          title="Du hast noch keine Pflanze."
          description="Lege zuerst eine Pflanze in der Sammlung an."
          action={{ label: "Zur Sammlung", href: "/collection" }}
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
