import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormRoot } from "@/components/ui/form";
import { TextField } from "@/components/ui/input";
import { errorText } from "@/lib/error-text";
import type { ApiError } from "../../../kernel";

const schema = z.object({ code: z.string().trim().min(1, "Bitte gib den Freundescode ein.") });
type Fields = z.infer<typeof schema>;

/** The text of a refusal by its error code, never the raw server text (P-10); the web app's own network text stays. */
const refusalText = (e: ApiError) =>
  e.code === "network.not_reachable" ? e.text : errorText(e.code);

/**
 * "Code eingeben" (US-SOZ-01): sends a friendship request with the code someone passed on. A refused code (unknown,
 * used, expired, own, already linked) stays visible at the field with its German text and the focus returns to it (P-10).
 * `onSend` resolves with the refusal, or `null` when the request was sent.
 */
export function CodeForm(props: {
  running: boolean;
  refusal: ApiError | null;
  onSend: (code: string) => Promise<boolean>;
}) {
  const form = useForm<Fields>({ resolver: zodResolver(schema), defaultValues: { code: "" } });
  const { setError } = form;
  const { refusal } = props;
  useEffect(() => {
    if (refusal)
      setError("code", { type: "server", message: refusalText(refusal) }, { shouldFocus: true });
  }, [refusal, setError]);
  const submit = form.handleSubmit(async ({ code }) => {
    if (await props.onSend(code)) form.reset({ code: "" });
  });
  const pending = props.running || form.formState.isSubmitting;
  return (
    <section aria-labelledby="friend-code-title" className="flex min-w-0 flex-col gap-3">
      <h2 id="friend-code-title" className="text-xl font-semibold">
        Code eingeben
      </h2>
      <p className="text-muted-foreground">
        Du hast einen Code bekommen? Gib ihn hier ein, dann geht deine Anfrage an die Person.
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
            <Button type="submit" size="touch" disabled={pending}>
              {pending ? "Sendet …" : "Anfrage senden"}
            </Button>
          </div>
        </FormRoot>
      </Form>
    </section>
  );
}
