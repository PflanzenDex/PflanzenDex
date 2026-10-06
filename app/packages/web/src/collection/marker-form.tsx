import { useCallback, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { specimenName } from "@pflanzendex/core";
import { Form, FormRoot } from "@/components/ui/form";
import type { ApiError } from "../kernel";
import { MarkerInput } from "./marker-fields";
import { FormButtons, Quiet, TITLE, Warning } from "./parts";
import { refusalText, useEdited } from "./refusal";
import { markerSchema, type MarkerFields } from "./schemas";

/**
 * Give a specimen a marker or change it (US-BES-03). The new name is shown before saving (DM-BES-03); the form says
 * that only the name changes, not the history (renaming changes no references).
 */
export function MarkerForm(props: {
  name: string;
  speciesName: string | null;
  marker: string | null;
  onSend: (marker: string) => Promise<ApiError | null>;
  onCancel: () => void;
}) {
  const form = useForm<MarkerFields>({
    resolver: zodResolver(markerSchema),
    defaultValues: { marker: props.marker ?? "" },
  });
  const [error, setError] = useState<ApiError | null>(null);
  const typed = useWatch({ control: form.control, name: "marker" }).trim();
  useEdited(
    form,
    useCallback(() => setError(null), []),
  );
  const submit = form.handleSubmit(async (values) => setError(await props.onSend(values.marker)));
  return (
    <section aria-labelledby="marker-title">
      <h1 id="marker-title" className={TITLE}>
        Kennzeichen ändern
      </h1>
      <p className="mb-2 text-muted-foreground">„{props.name}“</p>
      <Quiet className="mb-5">
        Nur der Name ändert sich: Messungen und Behandlungen bleiben beim Exemplar.
      </Quiet>
      <Form {...form}>
        <FormRoot
          onSubmit={submit}
          aria-label="Kennzeichen ändern"
          className="flex max-w-xl flex-col gap-4"
        >
          {props.speciesName && (
            <p
              className="m-0 break-words rounded-lg border border-border px-3.5 py-3 font-semibold"
              aria-live="polite"
            >
              Name: {specimenName(props.speciesName, typed || null)}
            </p>
          )}
          <MarkerInput control={form.control} name="marker" label="Kennzeichen" />
          {error && (
            <Warning>
              <p>{refusalText(error)}</p>
            </Warning>
          )}
          <FormButtons
            submit="Kennzeichen speichern"
            cancel="Abbrechen"
            pending={form.formState.isSubmitting}
            onCancel={props.onCancel}
          />
        </FormRoot>
      </Form>
    </section>
  );
}
