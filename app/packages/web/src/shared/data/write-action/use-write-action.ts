import { useCallback, useRef, useState } from "react";
import { useAnnounce } from "@/shared/platform/announcer/context";
import { isOnline } from "@/shared/platform/browser/network";
import { texts } from "@/shared/lib/text-rules/texts";
import {
  WRITE_SUCCEEDED,
  newRepeatKey,
  type ApiError,
  type BufferedRequest,
  type Response,
  type WriteOptions,
} from "../api";
import { todayLocal } from "../time-zone";
import { appendKey, entityKey, useRepeatKey, type KeyScope, type RepeatEntity } from "./repeat-key";
import { useRefusalDismiss } from "./conflict/refusal-dismiss";
import table from "./write-action.de.json";

export { WRITE_SUCCEEDED };

const t = texts(table);

export const SIGN_IN: ApiError = { code: "access.not_signed_in", text: "Bitte melde dich neu an." };

/** The answer of a write that was not sent: no token. The client made it, so the held key stays (US-QS-03). */
const NO_TOKEN = { ok: false as const, error: SIGN_IN };

/**
 * Says the result of a write: the German text and its kind (`useSay` of the toast provider: a success is announced, an error is a
 * toast, US-QS-32). A key conflict comes with `onClose`, which the toast calls when it is gone: it frees the key (US-QS-03).
 */
export type WriteSay = (message: string, kind?: "success" | "error", onClose?: () => void) => void;

/** The latest refusal and how many there were: a repeated refusal can be the very same error object (F-0160). */
function useRefusals() {
  const [state, set] = useState<{ error: ApiError | null; count: number }>({
    error: null,
    count: 0,
  });
  const record = useCallback(
    (error: ApiError | null) => set((s) => ({ error, count: error ? s.count + 1 : s.count })),
    [],
  );
  return [state, record] as const;
}

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

/** Says the result of a write to `say`: a success as it is, a refusal by the text of its code (`onClose` of a key conflict). */
const sayResult = (say: WriteSay, r: Response<unknown>, success: string, onClose?: () => void) => {
  if (r.ok) say(success);
  else void refusalTextLazily(r.error).then((text) => say(text, "error", onClose));
};

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
 *
 * Offline the write goes to the buffer before the token is asked: the buffer reads the token again when it delivers, so an
 * expired token does not cost the write (US-QS-10). The buffer sends the request later with the same key and settles the
 * key on its answer. A refusal that is still said is also followed by `after`: the page may have been stale.
 *
 * `failures` counts the refused writes: a repeated refusal can be the very same error object, so `error` alone cannot tell
 * a new one from the old (F-0160).
 *
 * A key conflict (`idempotency.key_conflict`) holds the key of its action until the keeper dismisses it (US-QS-03, P-10): its
 * `error` carries `dismiss`, which frees that key, clears the refusal and returns the focus to the control that started the
 * write; the notice that shows the refusal offers it as "Hinweis schließen" (`RefusalClose`, `RefusalAlert`, `ErrorNotice`).
 * `dismissRefusal` is the same function for a caller that has the hook at hand.
 *
 * `runSilent` is a background write (a seen mark, a feed mark, the zone defaults): a fresh key per send, held nothing, so
 * it frees no held key of the page (US-QS-03). `runQuiet` is a bulk write that says each of its results itself (the
 * buffered entries of a bulk share): it calls no `after` and says nothing, and it keeps the page busy until the bulk is
 * answered, so a second tap cannot queue it again (P-10).
 */
export function useWriteAction(
  token: () => Promise<string | undefined>,
  after: () => void,
  say?: WriteSay,
) {
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [{ error, count: failures }, record] = useRefusals();
  const busy = useRef(false);
  const keys = useRepeatKey();
  const announcer = useAnnounce();
  const { start, answered, dismissRefusal } = useRefusalDismiss(record);
  const perform = useCallback(
    async (send: WriteSend, success: string, pick: () => string, scope: KeyScope | null) => {
      if (busy.current) return;
      busy.current = true;
      start();
      const key = pick();
      let buffered = false;
      const buffer = announcer
        ? (request: BufferedRequest) => {
            buffered = true;
            return announcer.buffer({ token, request, success, after });
          }
        : undefined;
      const offline = !isOnline();
      if (!offline) setRunning(true);
      const tok = buffer && offline ? "" : await token();
      const r = tok === undefined ? NO_TOKEN : await send(tok, { key, buffer });
      if (scope) keys.settle(key, r, scope);
      busy.current = false;
      setRunning(false);
      if (buffered) return;
      const shown = answered(r.ok ? null : r.error, scope);
      if (say) sayResult(say, r, success, shown.onClose);
      else setMessage(r.ok ? success : null);
      after();
    },
    [token, after, announcer, say, keys, start, answered],
  );

  const run = useCallback(
    (send: WriteSend, success: string, scope: KeyScope) =>
      perform(send, success, () => keys.take(scope), scope),
    [perform, keys],
  );

  const runSilent = useCallback(
    (send: WriteSend, success: string) => perform(send, success, newRepeatKey, null),
    [perform],
  );

  const runQuiet = useCallback((send: (key: string) => Promise<unknown>) => {
    if (busy.current) return Promise.resolve();
    busy.current = true;
    setRunning(true);
    return send(newRepeatKey()).finally(() => {
      busy.current = false;
      setRunning(false);
    });
  }, []);

  return { running, message, error, failures, dismissRefusal, run, runSilent, runQuiet };
}

/**
 * The runner of the writes about one entity: each action of the entity is keyed to it (US-QS-03), so a page that writes
 * one plant or one item calls `run(send, success, action)` with the action only.
 */
export const entityRun =
  (write: ReturnType<typeof useWriteAction>, entity: RepeatEntity, id: string) =>
  (send: WriteSend, success: string, action: string) =>
    void write.run(send, success, entityKey(entity, id, action));

/**
 * The runner of a daily append about one entity (a watering, a fertilizing): the action names the operation and the local
 * day (the keeper's time zone), which names the occasion, so the next day's write is a write of its own (US-QS-03).
 */
export const dailyRun =
  (write: ReturnType<typeof useWriteAction>, entity: RepeatEntity, id: string) =>
  (send: WriteSend, success: string, action: string) =>
    void write.run(send, success, appendKey(entity, id, `${action}:${todayLocal()}`));
