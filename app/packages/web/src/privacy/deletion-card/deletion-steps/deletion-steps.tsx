import { Button } from "@/components/ui/button/button";
import { Input } from "@/components/ui/fields/input/input";
import { errorText } from "@/lib/error-text";
import { keepTogether } from "@/lib/format";
import type { ApiError } from "../../../kernel";
import { cancelDeletion, requestDeletion, type DeletionState } from "../../privacy-api";
import { MoreHelp } from "@/components/ui/display/more-help/more-help";
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

/** The content of the step, or the state when the deletion is requested or cannot be read (P-10). */
function StepContent(props: {
  state: DeletionState | undefined;
  loadError: ApiError | undefined;
  step: Step;
  typed: string;
  onType: (typed: string) => void;
  act: Act;
}) {
  const { state, act } = props;
  if (state === undefined)
    return props.loadError ? (
      <p role="alert" className={ALERT}>
        {failure(props.loadError)}
      </p>
    ) : (
      <p role="status" className="m-0">
        Löschung wird geladen …
      </p>
    );
  if (state.requested)
    return (
      <div className="flex flex-col gap-3">
        <p role="status" className="m-0 rounded-lg border border-border p-3">
          Die Löschung ist vorgemerkt: Dein Konto und alle deine Daten werden am{" "}
          <strong>{day(state.dueAt)}</strong> gelöscht. Bis dahin ändert sich nichts. Willst du sie
          behalten, nimm die Löschung zurück.
        </p>
        <Button
          type="button"
          variant="outline"
          className="self-start"
          disabled={act.running}
          onClick={() =>
            void act.send(cancelDeletion, "Die Löschung ist zurückgenommen. Dein Konto bleibt.")
          }
        >
          Löschung zurücknehmen
        </Button>
      </div>
    );
  if (props.step === 1) return <DeletionSummary />;
  return (
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
  );
}

/** The body of the deletion layer: the step, then the refusal or the confirmation of the last request. */
export function DeletionBody(props: {
  state: DeletionState | undefined;
  loadError: ApiError | undefined;
  step: Step;
  typed: string;
  onType: (typed: string) => void;
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

/** The footer of the deletion layer, below its scroll region: one filled action per step (US-QS-15, DS-62). */
export function DeletionFooter(props: {
  state: DeletionState | undefined;
  step: Step;
  typed: string;
  act: Act;
  onStep: (step: Step) => void;
  onClose: () => void;
}) {
  const { state, act } = props;
  if (state === undefined || state.requested) return null;
  if (props.step === 1)
    return (
      <>
        <Button type="button" className="w-full" onClick={() => props.onStep(2)}>
          Weiter
        </Button>
        <Button type="button" variant="ghost" className="w-full" onClick={props.onClose}>
          Abbrechen
        </Button>
      </>
    );
  return (
    <>
      <Button
        type="button"
        variant="destructive"
        className="w-full"
        disabled={props.typed.trim() !== CONFIRM_WORD || act.running}
        onClick={() => void act.send(requestDeletion, "Die Löschung ist vorgemerkt.")}
      >
        {act.running ? "Wird vorgemerkt …" : keepTogether("Konto in 7 Tagen löschen")}
      </Button>
      <Button type="button" variant="outline" className="w-full" onClick={() => props.onStep(1)}>
        Zurück
      </Button>
      <Button type="button" variant="ghost" className="w-full" onClick={props.onClose}>
        Abbrechen
      </Button>
    </>
  );
}
