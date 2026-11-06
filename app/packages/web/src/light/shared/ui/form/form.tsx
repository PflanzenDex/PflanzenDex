import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useState } from "react";
import {
  useForm,
  type Control,
  type DefaultValues,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/shared/ui/button/button";
import { texts } from "@/shared/lib/text-rules/texts";
import { cn } from "@/shared/lib/utils";
import table from "../../../light.de.json";
import { Field } from "@/shared/ui/fields/form/field/field";
import { Select } from "@/shared/ui/fields/select/select";
import type { ApiError } from "../../light-api/light-api";
import { ALERT_CLASSES, useServerRefusal } from "@/shared/ui/fields/form/server-refusal";

const t = texts(table);

/**
 * A form that saves through an operation: validates with its zod schema (focus goes to the first invalid field),
 * hands a server refusal to the fields it names (German text by error code, DS-49) and keeps the input on an error.
 */
export function useSaveForm<F extends FieldValues>(opts: {
  schema: z.ZodType<F, F>;
  defaults: DefaultValues<F>;
  save: (values: F) => Promise<ApiError | null>;
  refusable: readonly FieldPath<F>[];
  /** Empties the form after a successful save (create forms). */
  clear: boolean;
}) {
  const { schema, defaults, save, refusable, clear } = opts;
  const form = useForm<F>({ resolver: zodResolver(schema), defaultValues: defaults });
  const [error, setError] = useState<ApiError | null>(null);
  const fieldsOf = useCallback(
    (e: ApiError) => refusable.filter((f) => e.details?.some((d) => d.field === f)),
    [refusable],
  );
  const { alertText, alertRef } = useServerRefusal(error, form.setError, fieldsOf);
  const send = form.handleSubmit(async (values) => {
    const refusal = await save(values);
    setError(refusal);
    if (!refusal && clear) form.reset();
  });
  return { form, send, alertText, alertRef, running: form.formState.isSubmitting };
}

type Sent<F extends FieldValues> = ReturnType<typeof useSaveForm<F>>;

/** Alert of a refusal that names no field; takes the focus. */
export function RefusalAlert<F extends FieldValues>({ sent }: { sent: Sent<F> }) {
  if (sent.alertText === null) return null;
  return (
    <div
      role="alert"
      tabIndex={-1}
      ref={sent.alertRef}
      className={cn(ALERT_CLASSES, "md:col-span-2")}
    >
      <p>{sent.alertText}</p>
    </div>
  );
}

/** Submit button and optional cancel of a form row. */
export function FormButtons(props: {
  label: string;
  running: boolean;
  onCancel?: (() => void) | undefined;
}) {
  return (
    <div className="flex flex-col gap-3 md:col-span-2 md:flex-row">
      <Button type="submit" disabled={props.running}>
        {props.label}
      </Button>
      {props.onCancel && (
        <Button type="button" variant="secondary" onClick={props.onCancel}>
          {t("form.cancel")}
        </Button>
      )}
    </div>
  );
}

/**
 * Two columns from `md`, one on a phone. A 12 px gap: with 16 px the zone form was 2 px taller than its sheet at
 * 360 x 640 (issue 1182).
 */
export const FORM_GRID = "grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2";

/** One labelled select of a form; the options are passed as children. */
export function SelectField<T extends FieldValues>(props: {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Field control={props.control} name={props.name} label={props.label}>
      {(field) => <Select {...field}>{props.children}</Select>}
    </Field>
  );
}
