import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { type UseFormReturn, type UseFormSetError } from "react-hook-form";
import { Button } from "@/shared/ui/button";
import { FormBar } from "@/shared/ui/form-bar";
import { Banner } from "@/shared/patterns/states/banner/banner";
import { Form, FormRoot, useFieldForm } from "@/shared/ui/form";
import type { ApiError } from "../../../shared/data";
import { duplicate } from "../form";
import { MoreDetails } from "../more-details/more-details";
import { refusalText } from "@/shared/lib/error-text";
import { NameStepFields, REQUIRED_STEP, TextStepFields } from "../required-fields/required-fields";
import {
  EMPTY_PROPOSAL,
  proposalSchema,
  refusedFields,
  toProposalInput,
  type ProposalFields,
} from "../../shared/schemas";

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

/**
 * The visibility line (one neutral line, US-QS-21, F-0246: a plain fact is not a warning) and the step counter.
 */
function StepNotice({ step }: { step: 1 | 2 }) {
  return (
    <>
      <p className="text-sm text-muted-foreground">Nur du siehst die Art, bis sie geprüft ist.</p>
      <p className="text-sm text-muted-foreground">
        {step === 1 ? "Schritt 1 von 2" : "Schritt 2 von 2"}
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
        <Banner
          variant="error"
          tabIndex={-1}
          ref={props.alertRef}
          className="md:col-span-2"
          {...(error.dismiss ? { onDismiss: error.dismiss } : {})}
        >
          {refusalText(error)}
        </Banner>
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

/**
 * The actions of each step (US-QS-15, US-QS-21, SG-SHEET-04): "Abbrechen" leads, "Weiter" on step 1 and "Vorschlag sichern"
 * on step 2 trail. They stand last in the form, in the bar of a phone sheet or, from md, as a row after the last field. On
 * step 2 "Zurück" goes back to step 1; it is a plain button under the fields, not part of the bar, and nothing is sticky.
 */
function StepActions(props: { step: 1 | 2; formId: string; pending: boolean; onNext: () => void }) {
  // `md:col-span-2`: from md the bar is a row of the dialog and spans both columns of the form.
  if (props.step === 1)
    return (
      <FormBar onConfirm={props.onNext} className="md:col-span-2">
        Weiter
      </FormBar>
    );
  return (
    <FormBar
      formId={props.formId}
      pending={props.pending}
      pendingText="Sichert …"
      needsNetwork
      className="md:col-span-2"
    >
      Vorschlag sichern
    </FormBar>
  );
}

/** The step, the refusal of the last send and the actions of the steps: "Weiter" checks step 1, the send brings step 1 back on a refusal of its fields. */
function useProposalSteps(
  form: UseFormReturn<ProposalFields>,
  props: {
    startStep?: 1 | 2;
    onSend: (input: Record<string, unknown>, clear: () => void) => Promise<ApiError | null>;
  },
) {
  const [error, setError] = useState<ApiError | null>(null);
  const [step, setStep] = useState<1 | 2>(props.startStep ?? 1);
  const submit = form.handleSubmit(async (values) => {
    const refused = await props.onSend(toProposalInput(values), () => setError(null));
    // A refusal of a step-1 field brings that step back, so its field is on screen to take the focus.
    if (refused && refusedFields(refused).some(({ field }) => REQUIRED_STEP.includes(field)))
      setStep(1);
    setError(refused);
  });
  const next = async () => {
    if (await form.trigger([...REQUIRED_STEP], { shouldFocus: true })) setStep(2);
  };
  return { error, step, setStep, submit, next };
}

/**
 * Propose species, the path without AI (FR-KI-05): all required fields from DM-BES-01 in the form. The proposal is
 * visible only to the creator and goes into the review list (FR-BES-11); the UI says so beforehand. A refusal of
 * the server lands on the fields it names (German text by error code, focus on the first); without a field it stays
 * in an alert (P-10). Two steps (US-QS-21): the name and the growth measure, then the two texts and, behind "Mehr Angaben",
 * the optional light and details (US-QS-24). It lives in a layer (`?sheet=propose`, US-QS-21): the layer owns the heading and
 * the way out; its bar holds "Abbrechen" and the one filled action, "Weiter" or "Vorschlag sichern" (SG-SHEET-04).
 */
export function ProposalForm(props: {
  start?: string;
  onSend: (input: Record<string, unknown>, clear: () => void) => Promise<ApiError | null>;
  onExisting: (id: string) => void;
  /** The step to start on (tests and stories); the form starts on step 1. */
  startStep?: 1 | 2;
}) {
  const formId = useId();
  const form = useFieldForm<ProposalFields>({
    resolver: zodResolver(proposalSchema),
    defaultValues: { ...EMPTY_PROPOSAL, latinName: props.start ?? "" },
  });
  const { error, step, setStep, submit, next } = useProposalSteps(form, props);
  const { alertRef, namesField, existing } = useRefusal(error, form.setError);
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <StepNotice step={step} />
      <Form {...form}>
        <FormRoot
          id={formId}
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
          {step === 2 ? (
            <div className="md:col-span-2">
              <Button type="button" variant="plain" onClick={() => setStep(1)}>
                Zurück
              </Button>
            </div>
          ) : null}
          <StepActions
            step={step}
            formId={formId}
            pending={form.formState.isSubmitting}
            onNext={next}
          />
        </FormRoot>
      </Form>
    </section>
  );
}
