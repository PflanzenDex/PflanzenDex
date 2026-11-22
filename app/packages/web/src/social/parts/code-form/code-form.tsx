import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { z } from "zod";
import { Button } from "@/shared/ui/button/button";
import { BUSY_LOOK, cn } from "@/shared/lib/utils";
import { Form, FormRoot, useFieldForm } from "@/shared/ui/fields/form/form";
import { TextField } from "@/shared/ui/fields/input/input";
import { refusalText } from "@/shared/lib/error-text";
import type { ApiError } from "../../../shared/data";

const schema = z.object({ code: z.string().trim().min(1, "Gib den Freundescode ein.") });
type Fields = z.infer<typeof schema>;

/**
 * "Code eingeben", the second tab of the layer "Freund hinzufügen" (US-SOZ-01, US-QS-20): sends a friendship request with the code someone passed on. A refused code (unknown,
 * used, expired, own, already linked) stays visible at the field with its German text and the focus returns to it (P-10).
 * `onSend` resolves with the refusal, or `null` when the request was sent. A sent request is the line of the form: `sent`
 * takes the place of the hint, so the result shows where the keeper looks and nothing is inserted (SG-FEED-01, SG-FEED-05);
 * typing a new code brings the hint back (`onEdit`). While the request goes out the button is `aria-disabled`, not
 * `disabled`, and a second press sends nothing: a disabled button that holds the focus drops it to the body (F-0094,
 * issue 2464, SG-BASE-01), so the focus stays on the button.
 */
export function CodeForm(props: {
  running: boolean;
  refusal: ApiError | null;
  sent: string | null;
  onEdit: () => void;
  onSend: (code: string) => Promise<boolean>;
}) {
  const form = useFieldForm<Fields>({ resolver: zodResolver(schema), defaultValues: { code: "" } });
  const { setError } = form;
  const { refusal, onEdit } = props;
  const typed = form.watch("code");
  useEffect(() => {
    if (typed !== "") onEdit();
  }, [typed, onEdit]);
  useEffect(() => {
    if (refusal)
      setError("code", { type: "server", message: refusalText(refusal) }, { shouldFocus: true });
  }, [refusal, setError]);
  const pending = props.running || form.formState.isSubmitting;
  const submit = form.handleSubmit(async ({ code }) => {
    if (pending) return;
    if (await props.onSend(code)) form.reset({ code: "" });
  });
  return (
    <section aria-label="Code eingeben" className="flex min-w-0 flex-col gap-3">
      <p className={cn(props.sent ? "font-semibold" : "text-muted-foreground")}>
        {props.sent ?? "Wer dir den Code gegeben hat, bekommt eine Anfrage."}
      </p>
      <Form {...form}>
        <FormRoot onSubmit={submit} className="flex max-w-xl flex-col gap-4">
          <TextField
            control={form.control}
            name="code"
            label="Freundescode"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
          />
          <div>
            <Button
              type="submit"
              size="touch"
              aria-disabled={pending || undefined}
              className={BUSY_LOOK}
            >
              {pending ? "Sendet …" : "Anfrage senden"}
            </Button>
          </div>
        </FormRoot>
      </Form>
    </section>
  );
}
