import { useCallback, useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { type Control } from "react-hook-form";
import { SPECIMEN_LIMITS } from "@pflanzendex/core";
import { FormBar } from "@/shared/ui/form-bar";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormRoot,
  useFieldForm,
} from "@/shared/ui/form";
import { Textarea } from "@/shared/ui/textarea";
import { useUnsavedInput } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import type { ApiError } from "@/shared/data";
import { texts } from "@/shared/lib/text-rules/texts";
import { ErrorNotice } from "../../../../../specimens/cards/parts/parts";
import { useEdited, useRefusal } from "../../../../../specimens/model/refusal";
import { notesSchema, type NotesFields } from "../../../../../specimens/model/schemas";
import table from "../plant-notes.de.json";

const t = texts(table);

/** The form of the notes: "Notiz sichern" in the bar of the layer submits it by this id (SG-SHEET-04, US-QS-15). */
const NOTES_FORM = "notes-form";

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
  /** The write runs: the confirming action shows its pending text. */
  pending: boolean;
}) {
  const { send, onSaved } = props;
  const [error, setError] = useState<ApiError | null>(null);
  const form = useFieldForm<NotesFields>({
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
  // Typed text that is not saved asks before the layer leaves it, a cancel included (US-QS-32, SG-FORM-06).
  const { leave } = useUnsavedInput(form.formState.isDirty);
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
          <ErrorNotice>
            <p>{alertText}</p>
          </ErrorNotice>
        )}
        {/* "Abbrechen" goes back to the notes through the guard; both stand in the bar of the layer (SG-SHEET-04). */}
        <FormBar
          formId={NOTES_FORM}
          pending={props.pending}
          needsNetwork
          onCancel={() => leave(props.onCancel)}
        >
          {t("form.submit")}
        </FormBar>
      </FormRoot>
    </Form>
  );
}
