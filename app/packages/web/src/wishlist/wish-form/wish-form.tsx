import { useEffect, useId, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { type UseFormReturn } from "react-hook-form";
import type { ZoneStock } from "@pflanzendex/core";
import { FormBar } from "@/shared/ui/form-bar";
import { Form, FormRoot, useFieldForm } from "@/shared/ui/form";
import { FormMoreFields } from "@/shared/ui/form.more-fields";
import { useServerRefusal } from "@/shared/ui/form.server-refusal";
import { FormNotices } from "@/shared/patterns/elements/form-notices/form-notices";
import { useUnsavedInput } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { texts } from "@/shared/lib/text-rules/texts";
import type { ApiError } from "../../shared/data";
import { SpeciesPick } from "./species-pick/species-pick";
import { ChoiceFields, GermanNameField, ImageFields, NameField } from "./wish-fields/wish-fields";
import {
  EMPTY_FIELDS,
  fieldsOfRefusal,
  toWishInput,
  wishSchema,
  type WishFields,
} from "../schemas";
import table from "../wishlist.de.json";
import type { WishInput } from "../wishlist-api";

const ui = texts(table);

/**
 * Every optional field behind "Mehr Angaben": a value or a refusal opens it (P-10). The required name is not among them:
 * it stays in the visible part of the form (SG-FORM-04, F-0171).
 */
const FOLDED: readonly (keyof WishFields)[] = [
  "german",
  "targetZoneId",
  "difficulty",
  "reasoning",
  "imageUrl",
];
/** After a pick the German name is shown by the pick itself, so only the other fields open the group by their value. */
const FOLDED_AFTER_PICK = FOLDED.filter((name) => name !== "german");

/** The species pick as the main way, the free fields as the fallback below "Mehr Angaben" (US-QS-24, issue 1032). */
function FieldGroups(props: {
  form: UseFormReturn<WishFields>;
  access: { api: string; token: () => Promise<string | undefined> };
  zones: readonly ZoneStock[];
}) {
  const { form } = props;
  const [chosen, setChosen] = useState<string | null>(null);
  useEffect(() => {
    // A saved wish empties the form: the pick starts again.
    if (!form.formState.isDirty) setChosen(null);
  }, [form.formState.isDirty]);
  return (
    <>
      <SpeciesPick
        {...props.access}
        chosen={chosen}
        onPick={(h) => {
          form.setValue("name", h.latinName, { shouldValidate: true, shouldDirty: true });
          form.setValue("german", h.germanName ?? "");
          setChosen(h.germanName ? `${h.latinName} (${h.germanName})` : h.latinName);
        }}
        onOwnName={(text) => {
          // The searched text is the wish's own name: the name field takes it and the keeper types on there (issue 1964).
          form.setValue("name", text, { shouldValidate: true, shouldDirty: true });
          form.setFocus("name");
        }}
      />
      <NameField control={form.control} />
      <FormMoreFields
        control={form.control}
        names={chosen ? FOLDED_AFTER_PICK : FOLDED}
        forced={Boolean(form.formState.errors.german)}
      >
        <GermanNameField control={form.control} />
        <ChoiceFields control={form.control} zones={props.zones} />
        <ImageFields control={form.control} />
      </FormMoreFields>
    </>
  );
}

/** The form to record a wish (FR-WUN-01): only the name is required, the rest stays unknown instead of guessed (P-08). */
export function WishForm(props: {
  access: { api: string; token: () => Promise<string | undefined> };
  zones: readonly ZoneStock[];
  running: boolean;
  message: string | null;
  error: ApiError | null;
  /** Resolves true when the wish was saved, so the form can be emptied. */
  onSend: (input: WishInput) => Promise<boolean>;
}) {
  const formId = useId();
  const form = useFieldForm<WishFields>({
    resolver: zodResolver(wishSchema),
    defaultValues: EMPTY_FIELDS,
  });
  const { alertText, alertRef } = useServerRefusal(props.error, form.setError, fieldsOfRefusal);
  // Typed input that is not saved asks before the layer closes (US-QS-32).
  useUnsavedInput(form.formState.isDirty);
  const refused = Object.keys(form.formState.errors).length > 0;
  const pending = props.running || form.formState.isSubmitting;
  const submit = form.handleSubmit(async (values) => {
    if (await props.onSend(toWishInput(values))) form.reset(EMPTY_FIELDS);
  });
  return (
    // The layer "Neuer Wunsch" already names the form, so the section has no heading of its own (US-QS-24, issue 1032).
    <section aria-label={ui("form.section")} className="mt-7 flex flex-col gap-3">
      <FormNotices
        message={refused ? null : props.message}
        alertText={alertText}
        alertRef={alertRef}
        onDismiss={props.error?.dismiss}
      />
      <Form {...form}>
        <FormRoot id={formId} onSubmit={submit} className="flex max-w-xl flex-col gap-4">
          <FieldGroups form={form} access={props.access} zones={props.zones} />
          {/* The save stands after the last field with "Abbrechen", in the bar of a phone sheet, never in a sticky footer (US-QS-32, SG-SHEET-04). */}
          <FormBar formId={formId} pending={pending} pendingText={ui("form.saving")}>
            {ui("form.save")}
          </FormBar>
        </FormRoot>
      </Form>
    </section>
  );
}
