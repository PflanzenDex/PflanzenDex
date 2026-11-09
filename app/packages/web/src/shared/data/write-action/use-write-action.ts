import { useCallback, useRef, useState } from "react";
import { useAnnounce } from "@/shared/platform/announcer/context";
import { isOnline } from "@/shared/platform/browser/network";
import { texts } from "@/shared/lib/text-rules/texts";
import { WRITE_SUCCEEDED, type ApiError, type Response } from "../api";
import { useRepeatKey } from "./repeat-key";
import table from "./write-action.de.json";

export { WRITE_SUCCEEDED };

const t = texts(table);

export const SIGN_IN: ApiError = { code: "access.not_signed_in", text: "Bitte melde dich neu an." };

/** Says the result of a write as a toast: the German text and its kind (`useSay` of the toast provider, US-QS-07). */
export type WriteSay = (message: string, kind?: "success" | "error") => void;

/** Sends a write with the token and the repeat-guard key of its action (US-QS-03); the key is the one `run` made. */
export type WriteSend = (token: string, key: string) => Promise<Response<unknown>>;

/**
 * The German text of a refusal. The error-text module (the error code table) is loaded when a refusal is said, not
 * with the first load: this module sits in the shell (`shared/data` is imported by `main.tsx`), and the initial JS
 * budget (QG-U6, DS-08) would otherwise carry the whole table (US-QS-15). When that module cannot load, the refusal
 * still gets a toast with the generic text of this module's table, never silence (P-10).
 */
const refusalTextLazily = (error: ApiError) =>
  import("@/shared/lib/error-text").then(
    ({ refusalText }) => refusalText(error),
    () => t("refusal"),
  );

/**
 * One tap that writes: only one request runs at a time (a double tap sends one), afterwards `after` reloads the page
 * so it shows the real state, and the message says what changed (P-09). A refusal stays visible (P-10) and no message
 * is shown then. Without a token nothing is sent and the user is asked to sign in again. Without a network the write is buffered and
 * sent later (`outbox.ts`, US-QS-10). With `say` the result goes to a toast instead of `message` and `error`, so it inserts
 * nothing above the content (DS-54); the caller then shows no inline notice of its own.
 *
 * The repeat-guard key (US-QS-03) is made when the user acts. After a lost answer the hook keeps it and the next tap gives
 * it on, so the server answers the repeat with the stored answer; a success or a refusal ends the action and drops it.
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
  const keys = useRepeatKey();
  const announcer = useAnnounce();

  const run = useCallback(
    async (send: WriteSend, success: string) => {
      if (busy.current) return;
      busy.current = true;
      // One key per user action, made now unless a lost answer left one: the repeat carries the same key (US-QS-03).
      const key = keys.take();
      if (announcer && !isOnline()) {
        // Without a network the write waits in the buffer, with this key, and is sent when it is back; the notice says so
        // (US-QS-10). The promise settles on delivery, which answers the write: the key is done then.
        await announcer.buffer({ token, send, key, success, after });
        keys.drop();
        busy.current = false;
        return;
      }
      setRunning(true);
      const t = await token();
      const r = t ? await send(t, key) : { ok: false as const, error: SIGN_IN };
      keys.settle(key, r);
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
    [token, after, announcer, say, keys],
  );

  return { running, message, error, run };
}
