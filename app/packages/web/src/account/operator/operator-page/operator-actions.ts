import type { CreatedInvitation, OperatorCostFigure } from "@pflanzendex/core";
import { useRef, useState } from "react";
import {
  SIGN_IN,
  useInvalidate,
  useRepeatKey,
  type ApiError,
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
 * The repeat-guard target of the operator's writes (US-QS-03). One settings page is one target: the writes are not
 * about one row, and a success of any of them frees the keys the others still hold.
 */
const OPERATOR = "operator";

/** Sends a write of the action under its held key (US-QS-03): a lost answer repeats the same write under that key. */
function sendHeld<T>(
  keys: ReturnType<typeof useRepeatKey>,
  action: string,
  t: string,
  send: (t: string, opts: WriteOptions) => Promise<Response<T>>,
): Promise<Response<T>> {
  return keys.run((key) => send(t, { key }), { target: OPERATOR, action });
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
   * `input` is what decides the body of the write (the value, the figure, the row): another input is another action.
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
    const r = t
      ? await sendHeld(keys, `${scope}:${input}`, t, send)
      : { ok: false as const, error: SIGN_IN };
    busy.current = false;
    setRunning(false);
    setNotice(
      r.ok
        ? { scope, message: done(r.value), error: null }
        : { scope, message: null, error: r.error },
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
        JSON.stringify(figure),
        (t, opts) => setOperatorCost(api, t, figure, opts),
        () => "Monatliche Kosten gespeichert.",
      ),
    /** Closes an identity removal done by hand (US-ACC-04); the card and its row reload afterwards. */
    markIdentity: (entryId: string) =>
      run("deletion", entryId, (t, opts) => markIdentityRemoved(api, t, entryId, opts), markDone),
    create: (days: number) =>
      run(
        "codes",
        String(days),
        (t, opts) => createInvitation(api, t, days, opts),
        (v) => {
          setCreated(v);
          return "Einladungscode erstellt.";
        },
      ),
  };
}
export type Actions = ReturnType<typeof useOperatorActions>;
