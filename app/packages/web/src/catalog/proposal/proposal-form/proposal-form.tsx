import { useEffect, useRef, useState, type RefObject } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type UseFormSetError } from "react-hook-form";
import { Button } from "@/components/ui/button/button";
import { Form, FormRoot } from "@/components/ui/fields/form/form";
import type { ApiError } from "../../../kernel";
import { duplicate } from "../form";
import { MoreDetails } from "../more-details/more-details";
import { refusalText } from "../../shared/refusal";
import { NameStepFields, REQUIRED_STEP, TextStepFields } from "../required-fields/required-fields";
import {
  EMPTY_PROPOSAL,
  proposalSchema,
  refusedFields,
  toProposalInput,
  type ProposalFields,
} from "../../shared/schemas";

const ALERT =
  "rounded-lg border border-destructive p-3 text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Hands a server refusal to the form: the fields it names take its message and the focus, otherwise the alert does. */
function useRefusal(error: ApiError | null, refuse: UseFormSetError<ProposalFields>) {
  const alertRef = useRef<HTMLDivElement>(null);
  const namesField = error ? refusedFields(error).length > 0 : false;
  useEffect(() => {
    if (!error) return;
    const named = refusedFields(error);
    named.forEach(({ field, message }, i) =>
      refuse(field, { type: "server", message }, { shouldFocus: i === 0 }),
    );
    if (named.length === 0) alertRef.current?.focus();
  }, [error, refuse]);
  return { alertRef, namesField, existing: error ? duplicate(error) : null };
}

/** The visibility notice (two lines at most at 360 px, US-QS-21) and the step counter. */
function StepNotice({ step }: { step: 1 | 2 }) {
  return (
    <>
      <p className="rounded-lg border border-warning-border bg-warning p-2 text-sm text-warning-foreground">
        Nur für dich sichtbar, bis die Prüfliste sie freigibt.
      </p>
      <p className="text-sm text-muted-foreground">
        {step === 1 ? "Schritt 1 von 2 · * = Pflichtfeld" : "Schritt 2 von 2 · alles optional"}
      </p>
    </>
  );
}

/** What a refusal without a field of its own says, and the way to the species that already exists (P-10). */
function RefusalNotice(props: {
  error: ApiError | null;
  namesField: boolean;
  alertRef: RefObject<HTMLDivElement | null>;
  existing: { id: string; latinName: string } | null;
  onExisting: (id: string) => void;
}) {
  const { error, existing } = props;
  return (
    <>
      {error && !props.namesField && (
        <div role="alert" tabIndex={-1} ref={props.alertRef} className={`${ALERT} md:col-span-2`}>
          <p>{refusalText(error)}</p>
        </div>
      )}
      {existing && (
        <div className="md:col-span-2">
          <Button type="button" variant="secondary" onClick={() => props.onExisting(existing.id)}>
            Vorhandene Art ansehen: {existing.latinName}
          </Button>
        </div>
      )}
    </>
  );
}

/** The one filled action of each step (US-QS-15, US-QS-21): "Weiter" on step 1, "Vorschlag speichern" on step 2. */
function StepActions(props: {
  step: 1 | 2;
  pending: boolean;
  onNext: () => void;
  onBack: () => void;
}) {
  // Sticky at the foot of the sheet: the optional fields scroll, the one filled action stays in view (US-QS-21).
  if (props.step === 1)
    return (
      <div className="sticky bottom-0 flex flex-col gap-2 bg-card pt-2 md:col-span-2">
        <Button type="button" size="touch" onClick={props.onNext}>
          Weiter
        </Button>
      </div>
    );
  return (
    <div className="sticky bottom-0 flex flex-col gap-2 bg-card pt-2 md:col-span-2">
      <Button type="submit" size="touch" pending={props.pending} pendingLabel="Speichert …">
        Vorschlag speichern
      </Button>
      <Button type="button" variant="secondary" onClick={props.onBack}>
        Zurück
      </Button>
    </div>
  );
}

/**
 * Propose species, the path without AI (FR-KI-05): all required fields from DM-BES-01 in the form. The proposal is
 * visible only to the creator and goes into the review list (FR-BES-11); the UI says so beforehand. A refusal of
 * the server lands on the fields it names (German text by error code, focus on the first); without a field it stays
 * in an alert (P-10). Two steps (US-QS-21): the name and the growth measure, then the two texts and, behind "Mehr Angaben",
 * the optional light and details (US-QS-24); the action row stays in view. It lives in a layer (`?sheet=propose`, US-QS-21): the layer owns the heading and the way out,
 * "Vorschlag speichern" is its one filled action.
 */
export function ProposalForm(props: {
  start?: string;
  onSend: (input: Record<string, unknown>) => Promise<ApiError | null>;
  onExisting: (id: string) => void;
  /** The step to start on (tests and stories); the form starts on step 1. */
  startStep?: 1 | 2;
}) {
  const form = useForm<ProposalFields>({
    resolver: zodResolver(proposalSchema),
    defaultValues: { ...EMPTY_PROPOSAL, latinName: props.start ?? "" },
  });
  const [error, setError] = useState<ApiError | null>(null);
  const [step, setStep] = useState<1 | 2>(props.startStep ?? 1);
  const { alertRef, namesField, existing } = useRefusal(error, form.setError);
  const submit = form.handleSubmit(async (values) => {
    const refused = await props.onSend(toProposalInput(values));
    // A refusal of a step-1 field brings that step back, so its field is on screen to take the focus.
    if (refused && refusedFields(refused).some(({ field }) => REQUIRED_STEP.includes(field)))
      setStep(1);
    setError(refused);
  });
  const next = async () => {
    if (await form.trigger([...REQUIRED_STEP], { shouldFocus: true })) setStep(2);
  };
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <StepNotice step={step} />
      <Form {...form}>
        <FormRoot
          onSubmit={submit}
          aria-label="Art vorschlagen"
          className="grid gap-4 md:grid-cols-2"
        >
          {step === 1 ? (
            <NameStepFields control={form.control} />
          ) : (
            <>
              <TextStepFields control={form.control} />
              <MoreDetails control={form.control} />
            </>
          )}
          <RefusalNotice
            error={error}
            namesField={namesField}
            alertRef={alertRef}
            existing={existing}
            onExisting={props.onExisting}
          />
          <StepActions
            step={step}
            pending={form.formState.isSubmitting}
            onNext={next}
            onBack={() => setStep(1)}
          />
        </FormRoot>
      </Form>
    </section>
  );
}
