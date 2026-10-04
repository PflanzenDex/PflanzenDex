import { useCallback, useRef, useState } from "react";
import type { ApiError, Response } from "./api";

export const SIGN_IN: ApiError = { code: "access.not_signed_in", text: "Bitte melde dich neu an." };

/**
 * One tap that writes: only one request runs at a time (a double tap sends one), afterwards `after` reloads the page
 * so it shows the new state, and the message says what changed (P-09). A refusal stays visible (P-10) and no message
 * is shown then. Without a token nothing is sent and the user is asked to sign in again.
 */
export function useWriteAction(token: () => Promise<string | undefined>, after: () => void) {
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const busy = useRef(false);

  const run = useCallback(
    async (send: (token: string) => Promise<Response<unknown>>, success: string) => {
      if (busy.current) return;
      busy.current = true;
      setRunning(true);
      const t = await token();
      const r = t ? await send(t) : { ok: false as const, error: SIGN_IN };
      busy.current = false;
      setRunning(false);
      setError(r.ok ? null : r.error);
      setMessage(r.ok ? success : null);
      if (r.ok) after();
    },
    [token, after],
  );

  return { running, message, error, run };
}
