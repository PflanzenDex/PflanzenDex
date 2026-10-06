import { useEffect, useRef } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type UseFormSetError } from "react-hook-form";
import type { ZoneStock } from "@pflanzendex/core";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { errorText } from "@/lib/error-text";
import type { ApiError } from "../../kernel";
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

/** The form to record a wish (FR-WUN-01): only the name is required, the rest stays unknown instead of guessed (P-08). */
export function WishForm(props: {
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
    <section aria-labelledby="wish-form-title" className="mt-7 flex flex-col gap-3">
      <h2 id="wish-form-title" className="text-xl font-semibold">
        Wunsch erfassen
      </h2>
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
        <form noValidate onSubmit={(e) => void submit(e)} className="flex max-w-xl flex-col gap-4">
          <NameFields control={form.control} />
          <ChoiceFields control={form.control} zones={props.zones} />
          <ImageFields control={form.control} />
          <Button type="submit" size="touch" disabled={pending}>
            {pending ? "Speichert …" : "Wunsch speichern"}
          </Button>
        </form>
      </Form>
    </section>
  );
}
