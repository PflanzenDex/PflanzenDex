import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useLayer } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { layerOpenerId } from "@/shared/patterns/responsive/layer-sheet/use-layer";
import { LayerPart } from "@/shared/patterns/responsive/layer-sheet/layer-part/layer-part";
import { Button } from "@/shared/ui/button";
import { DelayedSkeleton, useHeldLoader } from "@/shared/ui/skeleton.delayed";
import { texts } from "@/shared/lib/text-rules/texts";
import { FailedValue } from "@/shared/patterns/states/request-state/failed-value/failed-value";
import { useRequest } from "../../shared/data";
import { loadDeletion, type DeletionState } from "../privacy-api";
import { DELETION_KEY, useDeletionAction } from "./use-deletion-action/use-deletion-action";
import { DeletionBar, DeletionBody, day, type Step } from "./deletion-steps/deletion-steps";
import table from "./deletion-card.de.json";

const t = texts(table);

type Token = () => Promise<string | undefined>;

const UNKNOWN = "unbekannt";
const LOADING = "wird geladen …";

/** The value of the row: the state as text, "unbekannt" when it cannot be read (P-08); while it waits, the loader (DS-57, D5). */
function deletionValue(state: DeletionState | undefined, waiting: boolean): ReactNode {
  if (waiting) return <DelayedSkeleton>{LOADING}</DelayedSkeleton>;
  if (state === undefined) return UNKNOWN;
  return state.requested ? `Löschung vorgemerkt für ${day(state.dueAt)}` : "Noch nichts vorgemerkt";
}

/** The state under the opener; a failed read says so and offers its retry (US-QS-32, P-08). */
function DeletionValue(props: {
  failed: boolean;
  retry: () => void;
  state: DeletionState | undefined;
  waiting: boolean;
}) {
  return props.failed ? (
    <FailedValue name={t("open")} onRetry={props.retry} />
  ) : (
    deletionValue(props.state, props.waiting)
  );
}

/**
 * Deleting the own account with a grace period (US-ACC-04): a red plain "Konto löschen" below the export, with the state
 * under it (SG-BTN-03, F-0303), and its layer. Not yet requested, the layer names what goes and stays (step 1), then asks
 * for the word LÖSCHEN (step 2); the actions sit in the bar of the layer, "Abbrechen" and the action of the step (SG-SHEET-04).
 * Requested, the layer shows the date and can take the request back. A closed layer loads nothing; the row needs only the
 * state (P-10: a failure stays in the row).
 */
export function DeletionCard(props: { api: string; token: Token }) {
  const load = useCallback((t: string) => loadDeletion(props.api, t), [props.api]);
  const r = useRequest({ queryKey: DELETION_KEY, fresh: true, token: props.token, load });
  const { open, openLayer } = useLayer("delete");
  const act = useDeletionAction({ api: props.api, token: props.token, loaded: r.value });
  const [step, setStep] = useState<Step>(1);
  const [typed, setTyped] = useState("");
  // The state waits for its loader: a shown loader holds once it has shown (D5), and the value, the footer and the body
  // follow the same held state. A failed read shows its retry (US-QS-32, P-08), after any hold.
  const waiting = useHeldLoader(act.state === undefined && r.status !== "error");
  const state = waiting ? undefined : act.state;
  const loadError = waiting ? undefined : r.error;
  const failed = r.status === "error";

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
      opener={
        <div className="@lg:col-span-2 mt-3 grid justify-items-start gap-1">
          <Button
            id={layerOpenerId("delete")}
            type="button"
            variant="destructive-plain"
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={(event) => openLayer(event.currentTarget)}
          >
            {t("open")}
          </Button>
          <div className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
            <DeletionValue failed={failed} retry={r.retry} state={state} waiting={waiting} />
          </div>
        </div>
      }
    >
      <div className="flex min-w-0 flex-col gap-3">
        <DeletionBody
          state={state}
          loadError={loadError}
          step={step}
          typed={typed}
          onType={setTyped}
          onStep={setStep}
          act={act}
        />
        {/* "Abbrechen" and the one action of the step stand after the text, in the bar of a phone sheet (SG-SHEET-04, issue 2024). */}
        <DeletionBar state={state} step={step} typed={typed} act={act} onStep={setStep} />
      </div>
    </LayerPart>
  );
}
