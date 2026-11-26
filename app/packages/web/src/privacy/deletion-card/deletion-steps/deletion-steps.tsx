import { Button } from "@/shared/ui/button";
import { FormBar } from "@/shared/ui/form-bar";
import { Input } from "@/shared/ui/input";
import { errorText } from "@/shared/lib/error-text";
import { keepTogether } from "@/shared/lib/format";
import { accountKey, type ApiError } from "../../../shared/data";
import { cancelDeletion, requestDeletion, type DeletionState } from "../../privacy-api";
import { MoreHelp } from "@/shared/ui/more-help";
import { DelayedSkeleton } from "@/shared/ui/skeleton.delayed";
import { CONFIRM_WORD, WhatHappens } from "../what-happens/what-happens";
import type { useDeletionAction } from "../use-deletion-action/use-deletion-action";

/** The two steps of asking for the deletion (US-ACC-04): what goes and stays, then the typed word. */
export type Step = 1 | 2;
type Act = ReturnType<typeof useDeletionAction>;

const ALERT =
  "rounded-lg border border-destructive p-3 text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export const day = (iso: string) =>
  new Date(iso).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" });

const failure = (e: ApiError) => (e.code === "network.not_reachable" ? e.text : errorText(e.code));

/**
 * Step 1 (US-QS-15): one line of what happens next; the lists of what goes and what stays are one tap away behind
 * "Mehr erfahren", so the layer and its footer fit a phone of 360 × 640 px.
 */
function DeletionSummary() {
  return (
    <MoreHelp more={<WhatHappens />}>
      Nach der Bestätigung passiert 7&nbsp;Tage lang nichts. Was gelöscht wird und was bleibt, steht
      hinter „Mehr erfahren“.
    </MoreHelp>
  );
}

/** The keys of the two deletion writes: a request and its cancel share the account target (US-QS-03). */
const REQUEST = accountKey("deletion:request");
const CANCEL = accountKey("deletion:cancel");
const cancelWrite = (act: Act) =>
  void act.send(cancelDeletion, "Die Löschung ist zurückgenommen. Dein Konto bleibt.", CANCEL);

/** The deletion is requested: the date, and the way to take it back (US-ACC-04). */
function RequestedState(props: { state: Extract<DeletionState, { requested: true }>; act: Act }) {
  const { state, act } = props;
  return (
    <div className="flex flex-col gap-3">
      <p role="status" className="m-0 rounded-lg border border-border p-3">
        Die Löschung ist vorgemerkt: Dein Konto und alle deine Daten werden am{" "}
        <strong>{day(state.dueAt)}</strong> gelöscht. Bis dahin ändert sich nichts. Willst du sie
        behalten, nimm die Löschung zurück.
      </p>
      <Button
        type="button"
        variant="tinted"
        className="self-start"
        disabled={act.running}
        needsNetwork
        onClick={() => cancelWrite(act)}
      >
        Löschung zurücknehmen
      </Button>
    </div>
  );
}

/** Step 2: the typed confirmation word; the way back to step 1 is a plain button under the field, the bar keeps its two actions (SG-SHEET-04). */
function ConfirmStep(props: {
  typed: string;
  onType: (typed: string) => void;
  onStep: (step: Step) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        <span>
          Zur Bestätigung tippe <strong>{CONFIRM_WORD}</strong>
        </span>
        <Input
          value={props.typed}
          autoComplete="off"
          onChange={(e) => props.onType(e.target.value)}
          aria-label={`Zur Bestätigung ${CONFIRM_WORD} eingeben`}
        />
      </label>
      <Button type="button" variant="plain" className="self-start" onClick={() => props.onStep(1)}>
        Zurück
      </Button>
    </div>
  );
}

/** The content of the step, or the state when the deletion is requested or cannot be read (P-10). */
function StepContent(props: {
  state: DeletionState | undefined;
  loadError: ApiError | undefined;
  step: Step;
  typed: string;
  onType: (typed: string) => void;
  onStep: (step: Step) => void;
  act: Act;
}) {
  const { state, act } = props;
  if (state === undefined)
    return props.loadError ? (
      <p role="alert" className={ALERT}>
        {failure(props.loadError)}
      </p>
    ) : (
      <DelayedSkeleton>
        <p role="status" className="m-0">
          Löschung wird geladen …
        </p>
      </DelayedSkeleton>
    );
  if (state.requested) return <RequestedState state={state} act={act} />;
  if (props.step === 1) return <DeletionSummary />;
  return <ConfirmStep typed={props.typed} onType={props.onType} onStep={props.onStep} />;
}

/** The body of the deletion layer: the step, then the refusal or the confirmation of the last request. */
export function DeletionBody(props: {
  state: DeletionState | undefined;
  loadError: ApiError | undefined;
  step: Step;
  typed: string;
  onType: (typed: string) => void;
  onStep: (step: Step) => void;
  act: Act;
}) {
  const { act, state } = props;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <StepContent {...props} />
      {act.error && (
        <p role="alert" className={ALERT}>
          {failure(act.error)}
        </p>
      )}
      {act.message && !state?.requested && (
        <p role="status" className="rounded-lg border border-border p-3">
          {act.message}
        </p>
      )}
    </div>
  );
}

/**
 * The bar of the deletion layer (US-QS-15, SG-SHEET-04): "Abbrechen" leads, the one action of the step trails, "Weiter" on
 * step 1 and the red "Konto in 7 Tagen löschen" on step 2, which stays inactive until the word is typed. Nothing while the
 * request is pending or the state cannot be read.
 */
export function DeletionBar(props: {
  state: DeletionState | undefined;
  step: Step;
  typed: string;
  act: Act;
  onStep: (step: Step) => void;
}) {
  const { state, act } = props;
  if (state === undefined || state.requested) return null;
  if (props.step === 1) return <FormBar onConfirm={() => props.onStep(2)}>Weiter</FormBar>;
  return (
    <FormBar
      destructive
      disabled={props.typed.trim() !== CONFIRM_WORD || act.running}
      needsNetwork
      onConfirm={() => void act.send(requestDeletion, "Die Löschung ist vorgemerkt.", REQUEST)}
    >
      {act.running ? "Wird vorgemerkt …" : keepTogether("Konto in 7 Tagen löschen")}
    </FormBar>
  );
}
