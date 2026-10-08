import { useCallback, useRef, useState } from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { ResponsiveModal } from "@/components/shared/responsive-modal";
import { Button } from "@/components/ui/button";
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
/** One request at a time (a double tap sends one); a refusal stays visible, a success says what was planned. */
export function usePlanning(api: string, token: Token, onPlanned: () => void) {
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
export function Planning(props: {
  request: Request<readonly TreatableSpecimen[]>;
  planning: ReturnType<typeof usePlanning>;
  focusRef: React.MutableRefObject<HTMLInputElement | null>;
  /** The message of a success is shown by the host (the form is in a modal that closes). */
  quiet?: boolean;
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
      {planning.message && !props.quiet && <StatusNote>{planning.message}</StatusNote>}
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

/** The planning form in a sheet or dialog (US-QS-14): it closes after a successful save, the section says what was planned. */
function PlanModal(props: {
  request: Request<readonly TreatableSpecimen[]>;
  planning: ReturnType<typeof usePlanning>;
  focusRef: React.MutableRefObject<HTMLInputElement | null>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { planning } = props;
  const send = async (input: TreatmentInput) => {
    const ok = await planning.send(input);
    if (ok) props.onOpenChange(false);
    return ok;
  };
  return (
    <ResponsiveModal
      title="Behandlung planen"
      closeLabel="Schließen"
      open={props.open}
      onOpenChange={props.onOpenChange}
    >
      <Planning
        request={props.request}
        planning={{ ...planning, send }}
        focusRef={props.focusRef}
        quiet
      />
    </ResponsiveModal>
  );
}

/** In a section of "Heute": the button that opens the form in its sheet or dialog (US-QS-14). */
export function HostPlanning(props: {
  canPlan: boolean;
  onPlan: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: Request<readonly TreatableSpecimen[]>;
  planning: ReturnType<typeof usePlanning>;
  focusRef: React.MutableRefObject<HTMLInputElement | null>;
}) {
  return (
    <>
      {props.canPlan && (
        <Button
          type="button"
          variant="outline"
          className="self-start rounded-full"
          onClick={props.onPlan}
        >
          Behandlung planen
        </Button>
      )}
      <PlanModal
        request={props.request}
        planning={props.planning}
        focusRef={props.focusRef}
        open={props.open}
        onOpenChange={props.onOpenChange}
      />
    </>
  );
}
