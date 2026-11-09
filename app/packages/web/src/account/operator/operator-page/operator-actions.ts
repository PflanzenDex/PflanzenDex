import type { CreatedInvitation, OperatorCostFigure } from "@pflanzendex/core";
import { useRef, useState } from "react";
import {
  SIGN_IN,
  useInvalidate,
  useRepeatKey,
  type ApiError,
  type Response,
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

/** One write at a time (a double tap sends one); a refusal stays visible (P-10), the page reloads afterwards. */
export function useOperatorActions(api: string, token: Token) {
  const invalidate = useInvalidate(OPERATOR_KEY);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [created, setCreated] = useState<CreatedInvitation | null>(null);
  const busy = useRef(false);
  const keys = useRepeatKey();

  const run = async <T>(
    scope: Scope,
    send: (t: string, key: string) => Promise<Response<T>>,
    done: (value: T) => string,
  ) => {
    if (busy.current) return;
    busy.current = true;
    setRunning(true);
    const t = await token();
    const key = keys.take();
    const r = t ? await send(t, key) : { ok: false as const, error: SIGN_IN };
    keys.settle(key, r);
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
        (t, key) => setRegistrationMode(api, t, on, { key }),
        (v) =>
          v.invitationOnly
            ? "Registrierung: ab jetzt nur mit Einladungscode."
            : "Registrierung: ab jetzt offen für alle.",
      ),
    setCost: (figure: OperatorCostFigure) =>
      run(
        "cost",
        (t, key) => setOperatorCost(api, t, figure, { key }),
        () => "Monatliche Kosten gespeichert.",
      ),
    /** Closes an identity removal done by hand (US-ACC-04); the card and its row reload afterwards. */
    markIdentity: (entryId: string) =>
      run("deletion", (t, key) => markIdentityRemoved(api, t, entryId, { key }), markDone),
    create: (days: number) =>
      run(
        "codes",
        (t, key) => createInvitation(api, t, days, { key }),
        (v) => {
          setCreated(v);
          return "Einladungscode erstellt.";
        },
      ),
  };
}
export type Actions = ReturnType<typeof useOperatorActions>;
