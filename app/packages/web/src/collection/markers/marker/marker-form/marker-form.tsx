import { useCallback, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useWatch } from "react-hook-form";
import { specimenName } from "@pflanzendex/core";
import { Form, FormRoot, useFieldForm } from "@/shared/ui/form";
import type { ApiError } from "../../../../shared/data";
import { MarkerInput } from "../marker-fields/marker-fields";
import { FormButtons, Quiet, ErrorNotice } from "../../../specimens/cards/parts/parts";
import { refusalText } from "@/shared/lib/error-text";
import { useEdited } from "../../../specimens/model/refusal";
import { markerSchema, type MarkerFields } from "../../../specimens/model/schemas";
import { texts } from "@/shared/lib/text-rules/texts";
import { PageHeader } from "@/shared/patterns/navigation/page-header/page-header";

import table from "./marker-form.de.json";
const tx = texts(table);

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
  const form = useFieldForm<MarkerFields>({
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
    <section aria-labelledby="marker-title" className="flex min-w-0 flex-col gap-2">
      <PageHeader
        headingId="marker-title"
        title={tx("title")}
        subject={props.name}
        back={{ label: tx("back", { name: props.name }), onBack: props.onCancel }}
      />
      <Quiet className="mb-5">
        Nur der Name ändert sich: Messungen und Behandlungen bleiben bei der Pflanze.
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
            <ErrorNotice>
              <p>{refusalText(error)}</p>
            </ErrorNotice>
          )}
          <FormButtons
            submit="Kennzeichen sichern"
            cancel="Abbrechen"
            pending={form.formState.isSubmitting}
            onCancel={props.onCancel}
          />
        </FormRoot>
      </Form>
    </section>
  );
}
