type FetchFn = typeof fetch;

/** Fired on `window` after every write that succeeded, so quiet observers (lock states, achievement banner) can look again. */
export const WRITE_SUCCEEDED = "pflanzendex:write-succeeded";

/**
 * Sends `WRITE_SUCCEEDED` once for a successful write. Every write goes through `call` (or the photo upload, which calls
 * it too), so each write announces itself exactly once, whichever screen or hook sent it (issue 1244).
 */
export function announceWrite(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(WRITE_SUCCEEDED));
}

/** API error with a stable code (FR-QG-11); `D` is the shape of optional extra data of the error. */
export interface ApiError<D = unknown> {
  code: string;
  text: string;
  details?: { field: string; code: string }[];
  data?: D[];
}

export type Response<T, D = unknown> = { ok: true; value: T } | { ok: false; error: ApiError<D> };

export type Write<D = unknown> = (
  method: "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
) => Promise<Response<unknown, D>>;

const NETWORK_ERROR: ApiError<never> = {
  code: "network.not_reachable",
  text: "Der Server ist gerade nicht erreichbar. Bitte versuche es gleich noch einmal.",
};

export async function call<T, D = unknown>(
  fetchFn: FetchFn,
  url: string,
  token: string,
  init: { method?: string; body?: unknown; key?: string } = {},
): Promise<Response<T, D>> {
  try {
    const method = init.method ?? "GET";
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
    return { ok: false, error: NETWORK_ERROR };
  }
}

/** Answers that do not say whether the server applied the write: its key stays for the repeat (US-QS-03). */
const UNANSWERED = new Set(["network.not_reachable", "idempotency.in_progress"]);

/**
 * Whether an answer leaves the write open: the server may have applied it, so the key of the action is kept for the
 * repeat. A refusal or any other answer ends the action (US-QS-03).
 */
export const isUnanswered = (error: ApiError): boolean => UNANSWERED.has(error.code);

/**
 * The repeat-guard key (`Idempotency-Key`) of one user action (US-QS-03). It is made once, when the user acts, and every
 * send of that action carries it, so a repeat after a lost answer reaches the server as the same write and the server
 * answers it with the stored answer. The server scopes a key per account and operation and refuses the same key with
 * another body (`idempotency.key_conflict`). The client compares no content.
 */
export const newRepeatKey = (): string => crypto.randomUUID();

/**
 * The optional parts of a write API call: the transport (tests inject one) and the repeat-guard key of the user action the
 * write belongs to (US-QS-03, see `newRepeatKey`). Without a key the write gets a key of its own.
 */
export interface WriteOptions {
  readonly fetchFn?: FetchFn | undefined;
  readonly key?: string | undefined;
}

/**
 * The write of one API call: its transport and repeat-guard key come from the call's options (see `WriteOptions`).
 */
export const writeFor = <D = unknown>(
  api: string,
  token: string,
  options: WriteOptions = {},
): Write<D> => createWrite<D>(api, token, options.fetchFn, options.key);

/**
 * Writes carry the repeat-guard key of their action (see `newRepeatKey`); without one, the write gets a key of its own.
 * A write that succeeded tells quiet observers (lock states, achievement banner) to look again: `call` announces it,
 * whichever screen sent it (US-ONB-05).
 */
export const createWrite =
  <D = unknown>(api: string, token: string, fetchFn: FetchFn = fetch, key?: string): Write<D> =>
  (method, path, body) =>
    call<unknown, D>(fetchFn, `${api}${path}`, token, {
      method,
      body,
      // Without the key of an action, every write gets a key of its own (a new one per send).
      key: key ?? newRepeatKey(),
    });
