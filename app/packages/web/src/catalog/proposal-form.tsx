import { useEffect, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type UseFormSetError } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import type { ApiError } from "../kernel";
import { duplicate } from "./form";
import { MoreDetails } from "./more-details";
import { refusalText } from "./refusal";
import { RequiredFields } from "./required-fields";
import {
  EMPTY_PROPOSAL,
  proposalSchema,
  refusedFields,
  toProposalInput,
  type ProposalFields,
} from "./schemas";

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

function Actions(props: { pending: boolean; onCancel: () => void }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row md:col-span-2">
      <Button type="submit" size="touch" pending={props.pending} pendingLabel="Speichert …">
        Vorschlag speichern
      </Button>
      <Button type="button" variant="secondary" size="touch" onClick={props.onCancel}>
        Abbrechen
      </Button>
    </div>
  );
}

/**
 * Propose species, the path without AI (FR-KI-05): all required fields from DM-BES-01 in the form. The proposal is
 * visible only to the creator and goes into the review list (FR-BES-11); the UI says so beforehand. A refusal of
 * the server lands on the fields it names (German text by error code, focus on the first); without a field it stays
 * in an alert (P-10).
 */
export function ProposalForm(props: {
  start?: string;
  onSend: (input: Record<string, unknown>) => Promise<ApiError | null>;
  onCancel: () => void;
  onExisting: (id: string) => void;
}) {
  const form = useForm<ProposalFields>({
    resolver: zodResolver(proposalSchema),
    defaultValues: { ...EMPTY_PROPOSAL, latinName: props.start ?? "" },
  });
  const [error, setError] = useState<ApiError | null>(null);
  const { alertRef, namesField, existing } = useRefusal(error, form.setError);
  const submit = form.handleSubmit(async (values) => {
    setError(await props.onSend(toProposalInput(values)));
  });
  return (
    <section aria-labelledby="proposal-title" className="flex min-w-0 flex-col gap-3">
      <h1 id="proposal-title" className="text-2xl font-semibold">
        Art vorschlagen
      </h1>
      <p className="rounded-lg border border-warning-border bg-warning p-3 text-warning-foreground">
        Dein Vorschlag ist zunächst nur für dich sichtbar und kommt in die Prüfliste. Erst nach der
        Freigabe sehen ihn alle und er zählt im Pokédex. Bis dahin kannst du die Art trotzdem für
        dich wählen.
      </p>
      <p className="text-sm text-muted-foreground">Pflichtfelder sind mit * markiert.</p>
      <Form {...form}>
        <form
          noValidate
          onSubmit={(e) => void submit(e)}
          aria-label="Art vorschlagen"
          className="grid gap-4 md:grid-cols-2"
        >
          <RequiredFields control={form.control} />
          <MoreDetails control={form.control} />
          {error && !namesField && (
            <div role="alert" tabIndex={-1} ref={alertRef} className={`${ALERT} md:col-span-2`}>
              <p>{refusalText(error)}</p>
            </div>
          )}
          {existing && (
            <div className="md:col-span-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => props.onExisting(existing.id)}
              >
                Vorhandene Art ansehen: {existing.latinName}
              </Button>
            </div>
          )}
          <Actions pending={form.formState.isSubmitting} onCancel={props.onCancel} />
        </form>
      </Form>
    </section>
  );
}
