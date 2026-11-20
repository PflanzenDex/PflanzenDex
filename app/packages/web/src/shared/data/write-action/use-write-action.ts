import { useCallback, useRef, useState } from "react";
import { useAnnounce } from "@/shared/platform/announcer/context";
import { isOnline } from "@/shared/platform/browser/network";
import { texts } from "@/shared/lib/text-rules/texts";
import {
  WRITE_SUCCEEDED,
  type ApiError,
  type BufferedRequest,
  type Response,
  type WriteOptions,
} from "../api";
import { useRepeatKey } from "./repeat-key";
import table from "./write-action.de.json";

export { WRITE_SUCCEEDED };

const t = texts(table);

export const SIGN_IN: ApiError = { code: "access.not_signed_in", text: "Bitte melde dich neu an." };

/** Says the result of a write: the German text and its kind (`useSay` of the toast provider: a success is announced, an error is a toast, US-QS-32). */
export type WriteSay = (message: string, kind?: "success" | "error") => void;

/**
 * Sends a write with the token and the options of the action: the repeat-guard key (US-QS-03) and, while the device is
 * offline, the buffer that takes the write as plain data (US-QS-10). A write API call passes `options` on (see `WriteOptions`).
 */
export type WriteSend = (token: string, options: WriteOptions) => Promise<Response<unknown>>;

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
 * is shown then. Without a token nothing is sent and the user is asked to sign in again. Without a network the write is
 * buffered as plain data and sent later with the same key (`outbox.ts`, US-QS-10, US-QS-03); the buffer says the result.
 * With `say` the result goes to `say` instead of `message`: a success is announced and a refusal is a toast
 * (`useSay`, US-QS-32), so it inserts nothing above the content (DS-54); the caller then shows no inline notice of its own.
 *
 * The repeat-guard key belongs to the action (US-QS-03): `run` takes it for the action in `scope` (the row or item id,
 * when this hook serves many), so a lost answer keeps its key for the next tap of that same action and nothing else.
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
    async (send: WriteSend, success: string, scope = "") => {
      if (busy.current) return;
      busy.current = true;
      const key = keys.take(scope);
      // The buffer takes the write when the device is offline: it sends the request later with this key, says the result
      // and calls `after` on delivery. Its answer is the delivery's answer, so the key is settled then.
      let buffered = false;
      const buffer = announcer
        ? (request: BufferedRequest) => {
            buffered = true;
            return announcer.buffer({ token, request, success, after });
          }
        : undefined;
      if (isOnline()) setRunning(true);
      const tok = await token();
      const r = tok ? await send(tok, { key, buffer }) : { ok: false as const, error: SIGN_IN };
      keys.settle(key, r, scope);
      busy.current = false;
      setRunning(false);
      // A write taken by the buffer is said by the buffer on delivery.
      if (buffered) return;
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
