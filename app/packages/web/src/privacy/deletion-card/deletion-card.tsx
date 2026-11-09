import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useLayer } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { LayerPart } from "@/shared/patterns/responsive/layer-sheet/layer-part/layer-part";
import { DelayedSkeleton } from "@/shared/ui/display/skeleton/delayed-skeleton/delayed-skeleton";
import { useRequest } from "../../shared/data";
import { loadDeletion, type DeletionState } from "../privacy-api";
import { DELETION_KEY, useDeletionAction } from "./use-deletion-action/use-deletion-action";
import { DeletionBody, DeletionFooter, day, type Step } from "./deletion-steps/deletion-steps";

type Token = () => Promise<string | undefined>;

const UNKNOWN = "unbekannt";
const LOADING = "wird geladen …";

/** The value of the row: the state as text, "unbekannt" when it cannot be read (P-08). */
function deletionValue(state: DeletionState | undefined, failed: boolean): ReactNode {
  if (state === undefined) return failed ? UNKNOWN : <DelayedSkeleton>{LOADING}</DelayedSkeleton>;
  return state.requested ? `Löschung vorgemerkt für ${day(state.dueAt)}` : "Noch nichts vorgemerkt";
}

/**
 * Deleting the own account with a grace period (US-ACC-04): a row "Konto löschen" that shows the state, and its layer.
 * Not yet requested, the layer names what goes and stays (step 1), then asks for the word LÖSCHEN (step 2); the footer
 * with the one filled action stays below the scroll region (US-QS-15). Requested, the layer shows the date and can take
 * the request back. A closed layer loads nothing; the row needs only the state (P-10: a failure stays in the row).
 */
export function DeletionCard(props: { api: string; token: Token }) {
  const load = useCallback((t: string) => loadDeletion(props.api, t), [props.api]);
  const r = useRequest({ queryKey: DELETION_KEY, fresh: true, token: props.token, load });
  const { open, closeLayer } = useLayer("delete");
  const act = useDeletionAction({ api: props.api, token: props.token, loaded: r.value });
  const [step, setStep] = useState<Step>(1);
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (!open) {
      setStep(1);
      setTyped("");
    }
  }, [open]);

  return (
    <LayerPart
      id="delete"
      title="Konto löschen?"
      value={deletionValue(act.state, r.status === "error")}
      primaryAction={
        <DeletionFooter
          state={act.state}
          step={step}
          typed={typed}
          act={act}
          onStep={setStep}
          onClose={closeLayer}
        />
      }
    >
      <DeletionBody
        state={act.state}
        loadError={r.error}
        step={step}
        typed={typed}
        onType={setTyped}
        act={act}
      />
    </LayerPart>
  );
}
