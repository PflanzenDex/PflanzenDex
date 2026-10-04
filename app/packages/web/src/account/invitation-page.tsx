import { useEffect, useRef, useState, type FormEvent } from "react";
import { SIGN_IN, type ApiError } from "../kernel";
import { redeemInvitation } from "./access-api";

type Token = () => Promise<string | undefined>;

const EMPTY: ApiError = { code: "input.invalid", text: "Bitte gib deinen Einladungscode ein." };

/**
 * The state of the form: one request at a time (a double tap sends one), an empty field is refused before sending, a
 * refusal of the server stays visible and the focus returns to the field (P-10).
 */
function useRedeem(api: string, token: Token, onRegistered: () => void) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const [running, setRunning] = useState(false);
  const busy = useRef(false);
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (error) field.current?.focus();
  }, [error]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy.current) return;
    const typed = code.trim();
    if (typed === "") return setError(EMPTY);
    busy.current = true;
    setRunning(true);
    const t = await token();
    const r = t ? await redeemInvitation(api, t, typed) : { ok: false as const, error: SIGN_IN };
    busy.current = false;
    setRunning(false);
    if (r.ok) onRegistered();
    else setError(r.error);
  };
  return { code, setCode, error, running, field, submit };
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
  const form = useRedeem(props.api, props.token, props.onRegistered);
  const { error } = form;
  return (
    <section className="card" aria-labelledby="invitation-title">
      <h1 id="invitation-title">Einladungscode</h1>
      <p className="lead">
        Die Registrierung ist im Moment nur mit Einladung möglich. Gib den Code ein, den du bekommen
        hast.
      </p>
      <p className="quiet">
        Du hast keinen Code? Bitte die Person, die PflanzenDex betreibt, um eine Einladung.
      </p>
      <form onSubmit={(e) => void form.submit(e)} noValidate>
        <label>
          Einladungscode
          <input
            ref={form.field}
            value={form.code}
            onChange={(e) => form.setCode(e.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "invitation-error" : undefined}
          />
        </label>
        {error && (
          <p role="alert" id="invitation-error" className="warning">
            {error.text}
          </p>
        )}
        <div className="actions">
          <button type="submit" className="primary" disabled={form.running}>
            Registrieren
          </button>
          <button type="button" className="secondary" onClick={props.onSignOut}>
            Abmelden
          </button>
        </div>
      </form>
    </section>
  );
}
