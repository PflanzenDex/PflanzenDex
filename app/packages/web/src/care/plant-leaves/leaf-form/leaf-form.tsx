import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type Control } from "react-hook-form";
import { LEAF_LIMITS } from "@pflanzendex/core";
import { Button } from "@/shared/ui/button/button";
import { Form, FormRoot } from "@/shared/ui/fields/form/form";
import { Field } from "@/shared/ui/fields/form/field/field";
import { Input } from "@/shared/ui/fields/input/input";
import { DateField } from "@/shared/ui/fields/input/native-fields/date-field/date-field";
import { Textarea } from "@/shared/ui/fields/textarea/textarea";
import { texts } from "@/shared/lib/text-rules/texts";
import type { ApiError } from "../../../shared/data";
import { RefusalAlert } from "../../shared/notices/notices";
import table from "../plant-leaves.de.json";
import { leafDefaults, leafSchema, toLeafInput, type LeafFields } from "./leaf-schema";
import type { LeafInput } from "../leaves-api";

const t = texts(table);
const FORM_ID = "leaf-form";

function Fields(props: { control: Control<LeafFields>; today: string }) {
  return (
    <>
      <Field control={props.control} name="date" label={t("form.date")}>
        {(field) => <DateField {...field} max={props.today} />}
      </Field>
      <Field control={props.control} name="length" label={t("form.length")}>
        {(field) => <Input {...field} inputMode="numeric" autoComplete="off" />}
      </Field>
      <Field control={props.control} name="width" label={t("form.width")}>
        {(field) => <Input {...field} inputMode="numeric" autoComplete="off" />}
      </Field>
      <Field control={props.control} name="note" label={t("form.note")}>
        {(field) => <Textarea {...field} rows={2} maxLength={LEAF_LIMITS.note.max} />}
      </Field>
    </>
  );
}

/**
 * The details of a new leaf (US-WAC-07): date (today by default, never in the future), length and width in millimetres
 * and a note, all optional but the date. It is opened from the plant's "Neue Blätter" and closes after the save. A
 * refusal of the server stays visible with the text of its code and keeps the input (P-10).
 */
export function LeafForm(props: {
  today: string;
  onSend: (input: LeafInput) => Promise<ApiError | null>;
  onSaved: () => void;
}) {
  const form = useForm<LeafFields>({
    resolver: zodResolver(leafSchema),
    defaultValues: leafDefaults(),
  });
  const [refusal, setRefusal] = useState<ApiError | null>(null);
  const submit = form.handleSubmit(async (values) => {
    const r = await props.onSend(toLeafInput(values));
    setRefusal(r);
    if (!r) props.onSaved();
  });
  return (
    <Form {...form}>
      <FormRoot
        id={FORM_ID}
        aria-label={t("form.title")}
        onSubmit={submit}
        className="flex flex-col gap-3"
      >
        <Fields control={form.control} today={props.today} />
        <p className="text-sm text-muted-foreground">{t("form.hint")}</p>
        {refusal && <RefusalAlert error={refusal} />}
        <Button
          type="submit"
          size="touch"
          className="w-full"
          disabled={form.formState.isSubmitting}
        >
          {t("form.save")}
        </Button>
      </FormRoot>
    </Form>
  );
}
