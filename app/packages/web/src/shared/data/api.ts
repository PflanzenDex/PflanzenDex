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
 * The repeat-guard key (`Idempotency-Key`) of each write whose answer is still open, by its logical write (method, URL
 * and body). A repeat of that write, from the outbox or from a retry after a lost answer, carries the same key, so the
 * server writes it once (US-QS-03). A success, a refusal or a refused sign-in ends the write and frees its key, so the
 * next write of the same content is a new one. The token is not part of the key: the server scopes keys per account.
 */
const openKeys = new Map<string, string>();

/**
 * Writes carry the repeat-guard key of their logical write (see `openKeys`). A write that succeeded tells quiet observers
 * (lock states, achievement banner) to look again: `call` announces it, whichever screen sent it (US-ONB-05).
 */
export const createWrite =
  <D = unknown>(api: string, token: string, fetchFn: FetchFn = fetch): Write<D> =>
  async (method, path, body) => {
    const logical = JSON.stringify([api, method, path, body ?? null]);
    const key = openKeys.get(logical) ?? crypto.randomUUID();
    openKeys.set(logical, key);
    const r = await call<unknown, D>(fetchFn, `${api}${path}`, token, { method, body, key });
    if (r.ok || !UNANSWERED.has(r.error.code)) openKeys.delete(logical);
    return r;
  };
