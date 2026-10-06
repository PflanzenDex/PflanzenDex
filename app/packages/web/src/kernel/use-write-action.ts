import { useCallback, useRef, useState } from "react";
import { useAnnounce } from "@/platform/announcer/context";
import { isOnline } from "@/platform/network";
import type { ApiError, Response } from "./api";

export const SIGN_IN: ApiError = { code: "access.not_signed_in", text: "Bitte melde dich neu an." };

/**
 * One tap that writes: only one request runs at a time (a double tap sends one), afterwards `after` reloads the page
 * so it shows the real state, and the message says what changed (P-09). A refusal stays visible (P-10) and no message
 * is shown then. Without a token nothing is sent and the user is asked to sign in again. Without a network the write is buffered and
 * sent later (`outbox.ts`, US-QS-10).
 */
export function useWriteAction(token: () => Promise<string | undefined>, after: () => void) {
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const busy = useRef(false);
  const announcer = useAnnounce();

  const run = useCallback(
    async (send: (token: string) => Promise<Response<unknown>>, success: string) => {
      if (busy.current) return;
      busy.current = true;
      if (announcer && !isOnline()) {
        // Without a network the write waits in the buffer and is sent when it is back; the notice says so (US-QS-10).
        await announcer.buffer({ token, send, success, after });
        busy.current = false;
        return;
      }
      setRunning(true);
      const t = await token();
      const r = t ? await send(t) : { ok: false as const, error: SIGN_IN };
      busy.current = false;
      setRunning(false);
      setError(r.ok ? null : r.error);
      setMessage(r.ok ? success : null);
      // Also after a refusal: the page may have been stale (e.g. archived elsewhere), the error stays on screen.
      after();
    },
    [token, after, announcer],
  );

  return { running, message, error, run };
}
