import { useCallback, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type Control } from "react-hook-form";
import { SPECIMEN_LIMITS } from "@pflanzendex/core";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormRoot,
} from "@/shared/ui/fields/form/form";
import { Textarea } from "@/shared/ui/fields/textarea/textarea";
import type { ApiError } from "@/shared/data";
import { texts } from "@/shared/lib/text-rules/texts";
import { FormButtons, Quiet, TITLE, Warning } from "../../../../../specimens/cards/parts/parts";
import { useEdited, useRefusal } from "../../../../../specimens/model/refusal";
import { notesSchema, type NotesFields } from "../../../../../specimens/model/schemas";
import type { NotesTarget } from "../../../../../specimens/hooks/use-notes";
import table from "../plant-notes.de.json";

const t = texts(table);

/** True when the server refused the text itself (field `notes`, for example over the limit). */
const notesFields = (error: ApiError): "notes"[] =>
  error.details?.some((d) => d.field === "notes") ? ["notes"] : [];

/** The text field of the notes: a multi-line field, labelled, with its limit and the privacy line (US-BES-18). */
function NotesField(props: { control: Control<NotesFields> }) {
  return (
    <FormField
      control={props.control}
      name="notes"
      render={({ field }) => (
        <FormItem>
          <FormLabel>{t("form.label")}</FormLabel>
          <FormControl>
            <Textarea {...field} rows={6} maxLength={SPECIMEN_LIMITS.notes.max} />
          </FormControl>
          <FormDescription>
            {t("form.description", { max: SPECIMEN_LIMITS.notes.max })}
          </FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/**
 * Writes or clears the private notes of a plant (US-BES-18), in the page like the other single-plant forms: it opens
 * with the notes the layer showed. An empty text clears them. A refusal marks the field and keeps the text (P-10).
 */
export function NotesForm(props: {
  state: {
    open: NotesTarget;
    send: (notes: string) => Promise<ApiError | null>;
    setOpen: (v: null) => void;
  };
}) {
  const { open, send, setOpen } = props.state;
  const [error, setError] = useState<ApiError | null>(null);
  const form = useForm<NotesFields>({
    resolver: zodResolver(notesSchema),
    defaultValues: { notes: open.notes ?? "" },
  });
  const alertText = useRefusal(error, form.setError, notesFields);
  useEdited(
    form,
    useCallback(() => setError(null), []),
  );
  const submit = form.handleSubmit(async (values) => setError(await send(values.notes)));
  return (
    <section aria-labelledby="notes-title">
      <h1 id="notes-title" className={TITLE}>
        {t("form.title")}
      </h1>
      <p className="mb-2 text-muted-foreground">{t("form.name", { name: open.name })}</p>
      <Quiet className="mb-5">{t("form.hint")}</Quiet>
      <Form {...form}>
        <FormRoot
          onSubmit={submit}
          aria-label={t("form.formLabel")}
          className="flex max-w-xl flex-col gap-4"
        >
          <NotesField control={form.control} />
          {alertText !== null && (
            <Warning>
              <p>{alertText}</p>
            </Warning>
          )}
          <FormButtons
            submit={t("form.submit")}
            cancel={t("form.cancel")}
            pending={form.formState.isSubmitting}
            onCancel={() => setOpen(null)}
          />
        </FormRoot>
      </Form>
    </section>
  );
}
