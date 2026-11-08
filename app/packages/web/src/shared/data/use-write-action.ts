import { useCallback, useRef, useState } from "react";
import { useAnnounce } from "@/shared/platform/announcer/context";
import { isOnline } from "@/shared/platform/browser/network";
import { WRITE_SUCCEEDED, type ApiError, type Response } from "./api";

export { WRITE_SUCCEEDED };

export const SIGN_IN: ApiError = { code: "access.not_signed_in", text: "Bitte melde dich neu an." };

/** Says the result of a write as a toast: the German text and its kind (`useSay` of the toast provider, US-QS-07). */
export type WriteSay = (message: string, kind?: "success" | "error") => void;

/**
 * The German text of a refusal. The error-text module (the error code table) is loaded when a refusal is said, not
 * with the first load: this module sits in the shell (`shared/data` is imported by `main.tsx`), and the initial JS
 * budget (QG-U6, DS-08) would otherwise carry the whole table (US-QS-15).
 */
const refusalTextLazily = (error: ApiError) =>
  import("@/shared/lib/error-text").then(({ refusalText }) => refusalText(error));

/**
 * One tap that writes: only one request runs at a time (a double tap sends one), afterwards `after` reloads the page
 * so it shows the real state, and the message says what changed (P-09). A refusal stays visible (P-10) and no message
 * is shown then. Without a token nothing is sent and the user is asked to sign in again. Without a network the write is buffered and
 * sent later (`outbox.ts`, US-QS-10). With `say` the result goes to a toast instead of `message` and `error`, so it inserts
 * nothing above the content (DS-54); the caller then shows no inline notice of its own.
 */
export function useWriteAction(
  token: () => Promise<string | undefined>,
  after: () => void,
  say?: WriteSay,
) {
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
      if (say) {
        if (r.ok) say(success);
        else void refusalTextLazily(r.error).then((text) => say(text, "error"));
      } else setMessage(r.ok ? success : null);
      // Also after a refusal: the page may have been stale (e.g. archived elsewhere), the error stays on screen.
      after();
    },
    [token, after, announcer, say],
  );

  return { running, message, error, run };
}
