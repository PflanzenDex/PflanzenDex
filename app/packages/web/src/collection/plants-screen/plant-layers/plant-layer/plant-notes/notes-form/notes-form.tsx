import { useCallback, useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type Control } from "react-hook-form";
import { SPECIMEN_LIMITS } from "@pflanzendex/core";
import { Button } from "@/shared/ui/button/button";
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
import { Warning } from "../../../../../specimens/cards/parts/parts";
import { useEdited, useRefusal } from "../../../../../specimens/model/refusal";
import { notesSchema, type NotesFields } from "../../../../../specimens/model/schemas";
import table from "../plant-notes.de.json";

const t = texts(table);

/** The form of the notes: the filled "Notiz speichern" in the footer of the layer submits it by this id (US-QS-15). */
export const NOTES_FORM = "notes-form";

/** True when the server refused the text itself (field `notes`, for example over the limit). */
const notesFields = (error: ApiError): "notes"[] =>
  error.details?.some((d) => d.field === "notes") ? ["notes"] : [];

/** The text field of the notes: a multi-line field, labelled, with its limit and how to remove the note (US-BES-18). */
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
 * Writes or clears the private notes of a plant inside their layer (US-BES-18): it opens with the notes the layer showed
 * and takes the focus. An empty text clears them. A refusal marks the field and keeps the text (P-10).
 */
export function NotesForm(props: {
  notes: string | null;
  send: (notes: string) => Promise<ApiError | null>;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { send, onSaved } = props;
  const [error, setError] = useState<ApiError | null>(null);
  const form = useForm<NotesFields>({
    resolver: zodResolver(notesSchema),
    defaultValues: { notes: props.notes ?? "" },
  });
  const alertText = useRefusal(error, form.setError, notesFields);
  useEdited(
    form,
    useCallback(() => setError(null), []),
  );
  const { setFocus } = form;
  useEffect(() => setFocus("notes"), [setFocus]);
  const submit = form.handleSubmit(async (values) => {
    const refused = await send(values.notes);
    setError(refused);
    if (refused === null) onSaved();
  });
  return (
    <Form {...form}>
      <FormRoot
        id={NOTES_FORM}
        onSubmit={submit}
        aria-label={t("form.formLabel")}
        className="grid gap-3"
      >
        <NotesField control={form.control} />
        {alertText !== null && (
          <Warning>
            <p>{alertText}</p>
          </Warning>
        )}
        <Button type="button" variant="outline" onClick={props.onCancel}>
          {t("form.cancel")}
        </Button>
      </FormRoot>
    </Form>
  );
}
