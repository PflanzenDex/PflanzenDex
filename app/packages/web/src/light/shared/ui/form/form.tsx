import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useState } from "react";
import {
  type Control,
  type DefaultValues,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";
import type { z } from "zod";
import { FormBar } from "@/shared/ui/form-bar";
import { Field } from "@/shared/ui/field";
import { Select } from "@/shared/ui/select";
import type { ApiError } from "../../light-api/light-api";
import { Banner } from "@/shared/patterns/states/banner/banner";
import { useServerRefusal } from "@/shared/ui/form.server-refusal";
import { useFieldForm } from "@/shared/ui/form";

/**
 * A form that saves through an operation: validates with its zod schema (focus goes to the first invalid field),
 * hands a server refusal to the fields it names (German text by error code, DS-49) and keeps the input on an error.
 * `save` gets `clearNote`, the way to remove the form's refusal: the key conflict of a create comes back with a `dismiss`
 * that frees the key and calls it (US-QS-03).
 */
export function useSaveForm<F extends FieldValues>(opts: {
  schema: z.ZodType<F, F>;
  defaults: DefaultValues<F>;
  save: (values: F, clearNote: () => void) => Promise<ApiError | null>;
  refusable: readonly FieldPath<F>[];
  /** Empties the form after a successful save (create forms). */
  clear: boolean;
}) {
  const { schema, defaults, save, refusable, clear } = opts;
  const form = useFieldForm<F>({ resolver: zodResolver(schema), defaultValues: defaults });
  const [error, setError] = useState<ApiError | null>(null);
  const fieldsOf = useCallback(
    (e: ApiError) => refusable.filter((f) => e.details?.some((d) => d.field === f)),
    [refusable],
  );
  const { alertText, alertRef } = useServerRefusal(error, form.setError, fieldsOf);
  const send = form.handleSubmit(async (values) => {
    const refusal = await save(values, () => setError(null));
    setError(refusal);
    if (!refusal && clear) form.reset();
  });
  return {
    form,
    send,
    alertText,
    alertRef,
    /** Frees the key of a key conflict and clears the note; `undefined` for every other refusal (US-QS-03). */
    dismiss: error?.dismiss,
    running: form.formState.isSubmitting,
  };
}

type Sent<F extends FieldValues> = ReturnType<typeof useSaveForm<F>>;

/** Alert of a refusal that names no field; takes the focus. The one error tone: red border and error mark (SG-COLOR-04). */
export function RefusalAlert<F extends FieldValues>({ sent }: { sent: Sent<F> }) {
  if (sent.alertText === null) return null;
  return (
    <Banner
      variant="error"
      tabIndex={-1}
      ref={sent.alertRef}
      className="md:col-span-2"
      {...(sent.dismiss ? { onDismiss: sent.dismiss } : {})}
    >
      {sent.alertText}
    </Banner>
  );
}

/**
 * "Abbrechen" and the confirming action of a zone or location form (SG-SHEET-04): in the bar of the sheet on a phone, a row after
 * the last field from `md`, never at the end of the scrolling content. The write needs the network (US-QS-30). `onCancel` is the
 * way out of a form that is not in a layer.
 */
export function SaveBar(props: {
  formId: string;
  label: string;
  running: boolean;
  onCancel?: (() => void) | undefined;
}) {
  return (
    <FormBar
      formId={props.formId}
      pending={props.running}
      needsNetwork
      className="md:col-span-2"
      {...(props.onCancel ? { onCancel: props.onCancel } : {})}
    >
      {props.label}
    </FormBar>
  );
}

/**
 * Two columns from `md`, one on a phone. A 12 px gap: with 16 px the zone form was 2 px taller than its sheet at
 * 360 x 640 (issue 1182).
 */
export const FORM_GRID = "grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2";

/**
 * One labelled select of a form; the options are passed as children. An optional `description` sits under the field and
 * is read with it (issue 1960: what "Keine Lichtzone" means for a location).
 */
export function SelectField<T extends FieldValues>(props: {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  description?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <Field
      control={props.control}
      name={props.name}
      label={props.label}
      description={props.description}
    >
      {(field) => <Select {...field}>{props.children}</Select>}
    </Field>
  );
}
