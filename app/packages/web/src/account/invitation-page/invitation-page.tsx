import { zodResolver } from "@hookform/resolvers/zod";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button/button";
import { Form, FormRoot } from "@/components/ui/fields/form/form";
import { SIGN_IN, type ApiError } from "../../kernel";
import { redeemInvitation } from "../api/access-api";
import { useServerRefusal } from "../refusal";
import { TextField } from "@/components/ui/fields/input/input";
import { invitationCodeSchema, type InvitationCodeFields } from "../schemas";

type Token = () => Promise<string | undefined>;

/** A refusal of the server always belongs to the one field of this form. */
const codeField = () => ["code" as const];

/**
 * The state of the form: one request at a time (a double tap sends one), an empty field is refused before sending, a
 * refusal of the server stays visible at the field and the focus returns to it (P-10).
 */
function useRedeem(api: string, token: Token, onRegistered: () => void) {
  const form = useForm<InvitationCodeFields>({
    resolver: zodResolver(invitationCodeSchema),
    defaultValues: { code: "" },
  });
  const [error, setError] = useState<ApiError | null>(null);
  const busy = useRef(false);
  useServerRefusal<InvitationCodeFields>(error, form.setError, codeField);
  const submit = form.handleSubmit(async ({ code }) => {
    if (busy.current) return;
    busy.current = true;
    const t = await token();
    const r = t ? await redeemInvitation(api, t, code) : { ok: false as const, error: SIGN_IN };
    busy.current = false;
    if (r.ok) onRegistered();
    else setError(r.error);
  });
  return { form, submit, pending: form.formState.isSubmitting };
}

/**
 * Shown to a signed-in person without account while registration needs an invitation code (US-ACC-05). A wrong, used
 * or expired code gets the same answer from the server, so the page cannot tell them apart either.
 */
export function InvitationPage(props: {
  api: string;
  token: Token;
  onRegistered: () => void;
  onSignOut: () => void;
}) {
  const { form, submit, pending } = useRedeem(props.api, props.token, props.onRegistered);
  return (
    <section
      aria-labelledby="invitation-title"
      className="flex w-full max-w-md min-w-0 flex-col gap-4 rounded-2xl border border-border bg-card p-5"
    >
      <h1 id="invitation-title" className="text-2xl font-semibold">
        Einladungscode
      </h1>
      <p className="text-muted-foreground">
        Die Registrierung ist im Moment nur mit Einladung möglich. Gib den Code ein, den du bekommen
        hast.
      </p>
      <p className="text-sm text-muted-foreground">
        Du hast keinen Code? Bitte die Person, die PflanzenDéx betreibt, um eine Einladung.
      </p>
      <Form {...form}>
        <FormRoot onSubmit={submit} className="flex flex-col gap-4">
          <TextField
            control={form.control}
            name="code"
            label="Einladungscode"
            autoComplete="one-time-code"
            autoCapitalize="characters"
            spellCheck={false}
          />
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button type="submit" size="touch" disabled={pending} className="sm:flex-1">
              Registrieren
            </Button>
            <Button
              type="button"
              variant="outline"
              size="touch"
              onClick={props.onSignOut}
              className="sm:flex-1"
            >
              Abmelden
            </Button>
          </div>
        </FormRoot>
      </Form>
    </section>
  );
}
