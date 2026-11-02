import { useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button/button";
import { LayerSheet, useLayer } from "@/components/shared/responsive/layer-sheet/layer-sheet";
import { EmptyState } from "@/components/shared/empty-state/empty-state";
import { RequestState } from "@/components/shared/states/request-state/request-state";
import { useToast } from "@/components/shared/states/toast/toast-provider/toast-provider";
import { useInvalidate, useRequest, type ApiError } from "@/kernel";
import { OPEN_KEY, SPECIMENS_KEY } from "../../../shared/api/query-keys";
import { RefusalAlert } from "../../../shared/notices/notices";
import { loadTreatableSpecimens, type TreatmentInput } from "../../../shared/api/treatments-api";
import { TreatmentFormSkeleton } from "../../treatments-page/treatments-page.skeleton";
import { usePlanning } from "../planning";
import { PLAN_FORM_ID, PlanForm } from "./plan-form/plan-form";

type Token = () => Promise<string | undefined>;
/** The layer's address value, `?sheet=plan` (US-QS-18). */
const PLAN_LAYER = "plan";
const LOADING = "Pflanzen werden geladen …";

/** The form with the plants of the account; it loads only while the layer is open (a closed layer loads nothing). */
function PlanBody(props: {
  api: string;
  token: Token;
  running: boolean;
  error: ApiError | null;
  onSend: (input: TreatmentInput) => Promise<boolean>;
}) {
  const { api, token } = props;
  const load = useCallback((t: string) => loadTreatableSpecimens(api, t), [api]);
  const request = useRequest({ queryKey: SPECIMENS_KEY, token, load });
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
      {props.error && <RefusalAlert error={props.error} />}
      <PlanForm specimens={specimens} running={props.running} onSend={props.onSend} />
    </RequestState>
  );
}

/**
 * "Behandlung planen" as a layer above the treatments (US-QS-18, A-04): plants with search, location filter and pages,
 * the term in a second view, and the save button in the footer, so it stays in view. A successful save closes the layer
 * (back to the layer Behandlungen) and confirms it as a toast; a refusal stays in the layer with its German text (P-10).
 */
export function PlanLayer(props: { api: string; token: Token }) {
  const { api, token } = props;
  const { open, closeLayer } = useLayer(PLAN_LAYER);
  const toast = useToast();
  const refreshOpen = useInvalidate(OPEN_KEY);
  const planning = usePlanning(api, token, (message) => {
    refreshOpen();
    toast.show({ message });
  });
  useEffect(() => {
    if (!open) planning.reset();
  }, [open, planning.reset]);
  const send = async (input: TreatmentInput) => {
    const ok = await planning.send(input);
    if (ok) closeLayer();
    return ok;
  };
  return (
    <LayerSheet
      id={PLAN_LAYER}
      title="Behandlung planen"
      primaryAction={
        <Button type="submit" form={PLAN_FORM_ID} size="touch" disabled={planning.running}>
          Behandlung speichern
        </Button>
      }
    >
      <PlanBody
        api={api}
        token={token}
        running={planning.running}
        error={planning.error}
        onSend={send}
      />
    </LayerSheet>
  );
}
