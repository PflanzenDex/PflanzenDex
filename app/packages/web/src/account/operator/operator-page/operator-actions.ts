import type { CreatedInvitation, OperatorCostFigure } from "@pflanzendex/core";
import { useRef, useState } from "react";
import { SIGN_IN, useInvalidate, type ApiError, type Response } from "../../../kernel";
import { createInvitation, setOperatorCost, setRegistrationMode } from "../../api/access-api";

export type Token = () => Promise<string | undefined>;
export const OPERATOR_KEY = ["account", "operator"] as const;

/** The layer a write belongs to: its outcome is shown in that layer, the one that stays open (P-10). */
export type Scope = "cost" | "mode" | "codes";
export type Notice = { scope: Scope; message: string | null; error: ApiError | null };

/** One write at a time (a double tap sends one); a refusal stays visible (P-10), the page reloads afterwards. */
export function useOperatorActions(api: string, token: Token) {
  const invalidate = useInvalidate(OPERATOR_KEY);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [created, setCreated] = useState<CreatedInvitation | null>(null);
  const busy = useRef(false);

  const run = async <T>(
    scope: Scope,
    send: (t: string) => Promise<Response<T>>,
    done: (value: T) => string,
  ) => {
    if (busy.current) return;
    busy.current = true;
    setRunning(true);
    const t = await token();
    const r = t ? await send(t) : { ok: false as const, error: SIGN_IN };
    busy.current = false;
    setRunning(false);
    setNotice(
      r.ok
        ? { scope, message: done(r.value), error: null }
        : { scope, message: null, error: r.error },
    );
    if (r.ok) invalidate();
  };

  return {
    running,
    notice,
    created,
    setMode: (on: boolean) =>
      run(
        "mode",
        (t) => setRegistrationMode(api, t, on),
        (v) =>
          v.invitationOnly
            ? "Registrierung: ab jetzt nur mit Einladungscode."
            : "Registrierung: ab jetzt offen für alle.",
      ),
    setCost: (figure: OperatorCostFigure) =>
      run(
        "cost",
        (t) => setOperatorCost(api, t, figure),
        () => "Monatliche Kosten gespeichert.",
      ),
    create: (days: number) =>
      run(
        "codes",
        (t) => createInvitation(api, t, days),
        (v) => {
          setCreated(v);
          return "Einladungscode erstellt.";
        },
      ),
  };
}
export type Actions = ReturnType<typeof useOperatorActions>;
