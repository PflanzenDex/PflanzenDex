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
 * and body; a photo upload uses its URL and the hash of the file), oldest first. A repeat of that write carries the same key, so the server writes it once (US-QS-03). A
 * refusal frees its own key. A success frees its own key and every older one: the user moved on, and replaying an
 * older write would swallow the newer one (archive, restore, archive). The token is not part of the key: the server
 * scopes keys per account.
 */
const openKeys = new Map<string, string>();

/** A success: frees the write's own key and every older open key; newer open keys stay (see `openKeys`). */
function settle(logical: string): void {
  if (!openKeys.has(logical)) return;
  for (const k of openKeys.keys()) {
    openKeys.delete(k);
    if (k === logical) return;
  }
}

/**
 * Sends one logical write under its repeat-guard key (see `openKeys`). `logical` names the write (its identity, e.g. the
 * method, URL and body); `send` sends it with the key it is given. A repeat of an open write gets the same key, so the
 * server answers it with the stored answer (US-QS-03).
 */
export async function withRepeatKey<T, D = unknown>(
  logical: string,
  send: (key: string) => Promise<Response<T, D>>,
): Promise<Response<T, D>> {
  const key = openKeys.get(logical) ?? crypto.randomUUID();
  openKeys.set(logical, key);
  const r = await send(key);
  if (r.ok) settle(logical);
  else if (!UNANSWERED.has(r.error.code)) openKeys.delete(logical);
  return r;
}

/**
 * Writes carry the repeat-guard key of their logical write (see `withRepeatKey`). A write that succeeded tells quiet
 * observers (lock states, achievement banner) to look again: `call` announces it, whichever screen sent it (US-ONB-05).
 */
export const createWrite =
  <D = unknown>(api: string, token: string, fetchFn: FetchFn = fetch): Write<D> =>
  (method, path, body) =>
    withRepeatKey<unknown, D>(JSON.stringify([api, method, path, body ?? null]), (key) =>
      call<unknown, D>(fetchFn, `${api}${path}`, token, { method, body, key }),
    );
