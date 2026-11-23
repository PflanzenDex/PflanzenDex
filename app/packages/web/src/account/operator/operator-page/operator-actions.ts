import type { CreatedInvitation, OperatorCostFigure } from "@pflanzendex/core";
import { useRef, useState } from "react";
import {
  createKey,
  SIGN_IN,
  useInvalidate,
  useRepeatKey,
  withConflictDismiss,
  type ApiError,
  type KeyScope,
  type Response,
  type WriteOptions,
} from "../../../shared/data";
import {
  createInvitation,
  markIdentityRemoved,
  setOperatorCost,
  setRegistrationMode,
} from "../../api/access-api";
import { texts } from "@/shared/lib/text-rules/texts";
import deletionTable from "../deletion-section/deletion-section.de.json";

const deletionText = texts(deletionTable);
/** The outcome of marking an identity removal (US-ACC-04): repeating it is a success too. */
const markDone = (v: { outcome: "marked" | "already" }) =>
  deletionText(v.outcome === "marked" ? "identity.marked" : "identity.already");

export type Token = () => Promise<string | undefined>;
export const OPERATOR_KEY = ["account", "operator"] as const;

/** The layer a write belongs to: its outcome is shown in that layer, the one that stays open (P-10). */
export type Scope = "cost" | "mode" | "codes" | "deletion";
export type Notice = { scope: Scope; message: string | null; error: ApiError | null };

/**
 * The repeat-guard target of the operator's set-state writes (US-QS-03). One settings page is one target: a success of any
 * of them frees the keys the others still hold.
 */
const OPERATOR = "operator";

/**
 * The key of an operator write (US-QS-03): the invitation codes are a create (their own target, `new:invite`), the other
 * writes set state on the page. The input is a discrete value or empty: never the body.
 */
const keyOf = (scope: Scope, input: string): KeyScope =>
  scope === "codes"
    ? createKey("invite", "codes")
    : { target: OPERATOR, action: `${scope}:${input}` };

/** Sends a write under its held key (US-QS-03): a lost answer repeats the same write under that key. */
function sendHeld<T>(
  keys: ReturnType<typeof useRepeatKey>,
  scope: KeyScope,
  t: string,
  send: (t: string, opts: WriteOptions) => Promise<Response<T>>,
): Promise<Response<T>> {
  return keys.run((key) => send(t, { key }), scope);
}

const modeText = (v: { invitationOnly: boolean }) =>
  v.invitationOnly
    ? "Registrierung: ab jetzt nur mit Einladungscode."
    : "Registrierung: ab jetzt offen für alle.";

/** One write at a time (a double tap sends one); a refusal stays visible (P-10), the page reloads afterwards. */
export function useOperatorActions(api: string, token: Token) {
  const invalidate = useInvalidate(OPERATOR_KEY);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [created, setCreated] = useState<CreatedInvitation | null>(null);
  const busy = useRef(false);
  const keys = useRepeatKey();

  /**
   * Resolves true when the write was saved; false when it was refused or skipped because another write runs (US-QS-32).
   * `input` is the discrete value of the action (a chosen value, an id), never the body of a create or of a whole form:
   * the key names the operation, the server refuses a changed body under it (US-QS-03). Empty for a whole form.
   */
  const run = async <T>(
    scope: Scope,
    input: string,
    send: (t: string, opts: WriteOptions) => Promise<Response<T>>,
    done: (value: T) => string,
  ): Promise<boolean> => {
    if (busy.current) return false;
    busy.current = true;
    setRunning(true);
    const t = await token();
    const held = keyOf(scope, input);
    const r = t ? await sendHeld(keys, held, t, send) : { ok: false as const, error: SIGN_IN };
    busy.current = false;
    setRunning(false);
    // A key conflict of the codes holds its key: "Hinweis schließen" frees it and clears the notice (US-QS-03, P-10).
    setNotice(
      r.ok
        ? { scope, message: done(r.value), error: null }
        : {
            scope,
            message: null,
            error: withConflictDismiss(r.error, held, () => setNotice(null)),
          },
    );
    if (r.ok) invalidate();
    return r.ok;
  };

  return {
    running,
    notice,
    created,
    setMode: (on: boolean) =>
      run("mode", String(on), (t, opts) => setRegistrationMode(api, t, on, opts), modeText),
    setCost: (figure: OperatorCostFigure) =>
      run(
        "cost",
        // A whole form: the operation only, the figure is the body (US-QS-03).
        "",
        (t, opts) => setOperatorCost(api, t, figure, opts),
        () => "Monatliche Kosten gesichert.",
      ),
    /** Closes an identity removal done by hand (US-ACC-04); the card and its row reload afterwards. */
    markIdentity: (entryId: string) =>
      run("deletion", entryId, (t, opts) => markIdentityRemoved(api, t, entryId, opts), markDone),
    create: (days: number) =>
      run(
        "codes",
        // A create (invitation codes are added): the operation only, the days are the body (US-QS-03).
        "",
        (t, opts) => createInvitation(api, t, days, opts),
        (v) => {
          setCreated(v);
          return "Einladungscode erstellt.";
        },
      ),
  };
}
export type Actions = ReturnType<typeof useOperatorActions>;
