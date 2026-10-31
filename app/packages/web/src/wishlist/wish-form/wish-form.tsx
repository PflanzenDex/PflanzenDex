import { useEffect, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type UseFormReturn, type UseFormSetError } from "react-hook-form";
import type { ZoneStock } from "@pflanzendex/core";
import { Button } from "@/components/ui/button/button";
import { Form, FormRoot } from "@/components/ui/fields/form/form";
import { FormMoreFields } from "@/components/ui/fields/form/more-fields/more-fields";
import { errorText } from "@/lib/error-text";
import type { ApiError } from "../../kernel";
import { SpeciesPick } from "./species-pick/species-pick";
import { ChoiceFields, ImageFields, NameFields } from "./wish-fields/wish-fields";
import {
  EMPTY_FIELDS,
  fieldsOfRefusal,
  toWishInput,
  wishSchema,
  type WishFields,
} from "../schemas";
import type { WishInput } from "../wishlist-api";

/**
 * Hands a server refusal to the form: the fields it names get the German text of its error code and the first of
 * them takes the focus (P-10). Returns the alert text when the refusal names no field. A refusal of a field goes
 * away as soon as that field is edited (react-hook-form revalidates it), without moving the focus.
 */
function useServerRefusal(error: ApiError | null, setError: UseFormSetError<WishFields>) {
  const alertRef = useRef<HTMLDivElement>(null);
  const named = error ? fieldsOfRefusal(error) : [];
  const alertText = error && named.length === 0 ? errorText(error.code) : null;
  useEffect(() => {
    if (!error) return;
    const fields = fieldsOfRefusal(error);
    fields.forEach((field, i) =>
      setError(field, { type: "server", message: errorText(error.code) }, { shouldFocus: i === 0 }),
    );
    if (fields.length === 0) alertRef.current?.focus();
  }, [error, setError]);
  return { alertText, alertRef };
}

/** Every field behind "Mehr Angaben": a value or a refusal opens it (P-10). */
const FOLDED: readonly (keyof WishFields)[] = [
  "name",
  "german",
  "targetZoneId",
  "difficulty",
  "reasoning",
  "imageUrl",
];
/** After a pick the names are shown by the pick itself, so only the other fields open the group by their value. */
const FOLDED_AFTER_PICK = FOLDED.filter((name) => name !== "name" && name !== "german");

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
      />
      <FormMoreFields
        control={form.control}
        names={chosen ? FOLDED_AFTER_PICK : FOLDED}
        forced={Boolean(form.formState.errors.name ?? form.formState.errors.german)}
      >
        <NameFields control={form.control} />
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
  const form = useForm<WishFields>({
    resolver: zodResolver(wishSchema),
    defaultValues: EMPTY_FIELDS,
  });
  const { alertText, alertRef } = useServerRefusal(props.error, form.setError);
  const refused = Object.keys(form.formState.errors).length > 0;
  const pending = props.running || form.formState.isSubmitting;
  const submit = form.handleSubmit(async (values) => {
    if (await props.onSend(toWishInput(values))) form.reset(EMPTY_FIELDS);
  });
  return (
    // The layer "Neuer Wunsch" already names the form, so the section has no heading of its own (US-QS-24, issue 1032).
    <section aria-label="Wunsch erfassen" className="mt-7 flex flex-col gap-3">
      {props.message && !refused && (
        <p role="status" className="rounded-lg border border-border p-3">
          {props.message}
        </p>
      )}
      {alertText !== null && (
        <div
          role="alert"
          tabIndex={-1}
          ref={alertRef}
          className="rounded-lg border border-destructive p-3 text-destructive"
        >
          <p>{alertText}</p>
        </div>
      )}
      <Form {...form}>
        <FormRoot onSubmit={submit} className="flex max-w-xl flex-col gap-4">
          <FieldGroups form={form} access={props.access} zones={props.zones} />
          {/* Sticky: the form scrolls inside the layer while the save button stays in view (US-QS-15). */}
          <div className="sticky bottom-0 bg-card py-2">
            <Button type="submit" size="touch" className="w-full" disabled={pending}>
              {pending ? "Speichert …" : "Wunsch speichern"}
            </Button>
          </div>
        </FormRoot>
      </Form>
    </section>
  );
}
