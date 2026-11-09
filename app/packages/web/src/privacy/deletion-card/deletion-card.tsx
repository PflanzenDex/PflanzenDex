import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useLayer } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { LayerPart } from "@/shared/patterns/responsive/layer-sheet/layer-part/layer-part";
import {
  DelayedSkeleton,
  useHeldLoader,
} from "@/shared/ui/display/skeleton/delayed-skeleton/delayed-skeleton";
import { useRequest } from "../../shared/data";
import { loadDeletion, type DeletionState } from "../privacy-api";
import { DELETION_KEY, useDeletionAction } from "./use-deletion-action/use-deletion-action";
import { DeletionBody, DeletionFooter, day, type Step } from "./deletion-steps/deletion-steps";

type Token = () => Promise<string | undefined>;

const UNKNOWN = "unbekannt";
const LOADING = "wird geladen …";

/** The value of the row: the state as text, "unbekannt" when it cannot be read (P-08); while it waits, the loader (DS-57, D5). */
function deletionValue(state: DeletionState | undefined, waiting: boolean): ReactNode {
  if (waiting) return <DelayedSkeleton>{LOADING}</DelayedSkeleton>;
  if (state === undefined) return UNKNOWN;
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
  // The state waits for its loader: a shown loader holds once it has shown (D5), and the value, the footer and the body
  // follow the same held state. A failed read shows "unbekannt" (P-08), after any hold.
  const waiting = useHeldLoader(act.state === undefined && r.status !== "error");
  const state = waiting ? undefined : act.state;
  const loadError = waiting ? undefined : r.error;

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
      value={deletionValue(state, waiting)}
      primaryAction={
        <DeletionFooter
          state={state}
          step={step}
          typed={typed}
          act={act}
          onStep={setStep}
          onClose={closeLayer}
        />
      }
    >
      <DeletionBody
        state={state}
        loadError={loadError}
        step={step}
        typed={typed}
        onType={setTyped}
        act={act}
      />
    </LayerPart>
  );
}
