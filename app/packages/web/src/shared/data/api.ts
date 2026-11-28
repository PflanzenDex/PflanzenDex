import { isOnline } from "@/shared/platform/browser/network";
import { texts } from "@/shared/lib/text-rules/texts";
import type { ApiError, Response } from "@/shared/request/response";
import refusalTable from "./write-action/write-action.de.json";

export type { ApiError, Response } from "@/shared/request/response";

type FetchFn = typeof fetch;

/**
 * The account (`sub`) the tab's session loaded (US-QS-07, P-04): the session sets it at once, the check reads it. `undefined`:
 * no session loaded one yet (writes behave as before); `null`: the session loaded a sign-in without an account (fail closed).
 */
export const tabAccount: { sub: string | null | undefined } = { sub: undefined };

/** Fired on `window` after every write that succeeded, so quiet observers (lock states, achievement banner) can look again. */
export const WRITE_SUCCEEDED = "pflanzendex:write-succeeded";

/**
 * Sends `WRITE_SUCCEEDED` once for a successful write. Every write goes through `call` (or the photo upload, which calls
 * it too), so each write announces itself exactly once, whichever screen or hook sent it (issue 1244).
 */
export function announceWrite(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(WRITE_SUCCEEDED));
}

export type Write<D = unknown> = (
  method: "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
) => Promise<Response<unknown, D>>;

const NETWORK_ERROR: ApiError<never> = {
  code: "network.not_reachable",
  text: "Der Server ist gerade nicht erreichbar. Bitte versuche es gleich noch einmal.",
};

/**
 * A write that got no answer while the device is offline (issue 1863): the network is missing, not the server, and the
 * form keeps what was typed. Same code as `NETWORK_ERROR`, so the repeat guard and the buffer treat both alike.
 */
const OFFLINE_WRITE_ERROR: ApiError<never> = {
  code: "network.not_reachable",
  text: "Keine Verbindung. Deine Eingabe bleibt hier stehen.",
};

/**
 * The refusal of a request of a tab that loaded another account (US-QS-07, P-04, P-05). The check is its own chunk, so the
 * entry carries no sign-in reader (DS-08); a chunk that cannot load refuses the request too, nothing is sent unchecked
 * (P-04, P-10).
 */
const refusalOfTab = () =>
  import("./write-action/tab-account/tab-account").then(
    (m) => m.accountRefusal(),
    () => ({ code: "system.unexpected", text: texts(refusalTable)("refusal") }),
  );

/** The refusal of a request of this tab, checked in its own chunk (US-QS-07); the notice asks the same question. */
export const tabRefusal = refusalOfTab;

/** The error of a request that got no answer: offline writes say that the connection is missing (issue 1863). */
const unanswered = (method: string): ApiError<never> =>
  method !== "GET" && !isOnline() ? OFFLINE_WRITE_ERROR : NETWORK_ERROR;

export async function call<T, D = unknown>(
  fetchFn: FetchFn,
  url: string,
  token: string,
  init: { method?: string; body?: unknown; key?: string } = {},
): Promise<Response<T, D>> {
  const method = init.method ?? "GET";
  // A request of a tab that loaded another account is refused before it is sent, a read as well as a write: the token may
  // belong to that other account and would fetch its data (US-QS-07, P-04, P-05). The check runs here, right before the
  // request, so a token read earlier is checked as well.
  const refused = await refusalOfTab();
  if (refused) return { ok: false, error: refused };
  try {
    const res = await fetchFn(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(init.key ? { "Idempotency-Key": init.key } : {}),
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: ApiError<D> };
    if (res.ok) {
      if (method !== "GET") announceWrite();
      return { ok: true, value: body as T };
    }
    if (res.status === 401)
      return {
        ok: false,
        error: { code: "access.not_signed_in", text: "Bitte melde dich neu an." },
      };
    return { ok: false, error: body.error ?? NETWORK_ERROR };
  } catch {
    return { ok: false, error: unanswered(method) };
  }
}

/**
 * Answers that leave the write open (US-QS-03): the server may have applied it (no answer, `in_progress`), or it never
 * got the write (no token, `access.not_signed_in`: the sign-in check comes before the key is stored, so nothing was
 * stored for it). The key of the action is kept for the repeat.
 */
const UNANSWERED = new Set([
  "network.not_reachable",
  "idempotency.in_progress",
  "access.not_signed_in",
]);

/**
 * Whether an answer leaves the write open: the key of the action is kept for the repeat. A refusal of the operation ends
 * the action (its key is discarded by the server, US-QS-03).
 */
export const isUnanswered = (error: ApiError): boolean => UNANSWERED.has(error.code);

/** Whether a refusal is a key conflict: the key came back with other content (US-QS-03). */
export const isKeyConflict = (error: { code: string }): boolean =>
  error.code === "idempotency.key_conflict";

/**
 * The repeat-guard key (`Idempotency-Key`) of one user action (US-QS-03). It is made once, when the user acts, and every
 * send of that action carries it, so a repeat after a lost answer reaches the server as the same write and the server
 * answers it with the stored answer. The server scopes a key per account and operation and refuses the same key with
 * another body (`idempotency.key_conflict`). The client compares no content.
 */
export const newRepeatKey = (): string => crypto.randomUUID();

/**
 * A write that waits in the buffer while the device is offline (US-QS-10): plain data, so every delivery sends the same
 * request with the same key (US-QS-03).
 */
export type BufferedRequest = {
  method: "POST" | "PUT" | "DELETE";
  url: string;
  body?: unknown;
  key: string;
};

/**
 * The options of a write API call. `key` is the repeat-guard key of the user action the write belongs to (see
 * `newRepeatKey`) and is required: a write without one would get a key of its own on every send, so a repeat after a
 * lost answer could write twice. `fetchFn` is the transport (tests inject one). `buffer` is set by `useWriteAction` only:
 * while the device is offline, the write is handed to it as plain data instead of being refused (US-QS-10).
 */
export interface WriteOptions {
  readonly fetchFn?: FetchFn | undefined;
  readonly key: string;
  readonly buffer?: ((request: BufferedRequest) => Promise<Response<unknown>>) | undefined;
}

/**
 * Writes carry the repeat-guard key of their action (see `WriteOptions`). A write that succeeded tells quiet observers
 * (lock states, achievement banner) to look again: `call` announces it, whichever screen sent it (US-ONB-05). While the
 * device is offline a write is handed to the buffer when the caller gives one (US-QS-10, the buffer sends it once the
 * network is back); otherwise it is refused here before anything is sent (US-QS-30, P-10): a form submit, a key or a
 * background mark cannot send it past the button.
 */
export const createWrite =
  <D = unknown>(api: string, token: string, options: WriteOptions): Write<D> =>
  (method, path, body) => {
    const url = `${api}${path}`;
    if (!isOnline()) {
      if (options.buffer)
        return options.buffer({ method, url, body, key: options.key }) as Promise<
          Response<unknown, D>
        >;
      return Promise.resolve({ ok: false, error: OFFLINE_WRITE_ERROR as ApiError<D> });
    }
    return call<unknown, D>(options.fetchFn ?? fetch, url, token, {
      method,
      body,
      key: options.key,
    });
  };
