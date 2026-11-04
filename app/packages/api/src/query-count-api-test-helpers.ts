import { randomUUID } from "node:crypto";
import type { Hono } from "hono";

// US-QG-07: the gate and its seed call the app in process, the way a signed-in keeper does (bearer token, idempotency key).
export type Body = Record<string, unknown>;
export type Reply = { status: number; body: Body };
export type Api = {
  call: (sub: string, method: string, path: string, body?: unknown) => Promise<Reply>;
  /** A seed write: any answer but 2xx throws with the server's reply, so a rejected write never goes unnoticed (NFR-12). */
  ok: (sub: string, method: string, path: string, body?: unknown) => Promise<Body>;
};

/** The first status that is not a success. */
const NOT_SUCCESS = 300;

/** The JSON object of an answer, or `{}` for a file (the account export is a ZIP archive). */
function asBody(text: string): Body {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Body)
      : {};
  } catch {
    return {};
  }
}

export function apiFor(app: Hono): Api {
  const call: Api["call"] = async (sub, method, path, body) => {
    const res = await app.request(path, {
      method,
      headers: {
        "content-type": "application/json",
        "idempotency-key": randomUUID(),
        authorization: `Bearer valid:${sub}`,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: res.status, body: asBody(await res.text()) };
  };
  const ok: Api["ok"] = async (sub, method, path, body) => {
    const r = await call(sub, method, path, body);
    if (r.status >= NOT_SUCCESS)
      throw new Error(`${method} ${path} -> ${r.status} ${JSON.stringify(r.body)}`);
    return r.body;
  };
  return { call, ok };
}

/** A string field of a reply; a missing one throws instead of turning into "undefined" (NFR-12). */
export function text(body: Body, key: string): string {
  const value = body[key];
  if (typeof value !== "string") throw new Error(`no ${key} in ${JSON.stringify(body)}`);
  return value;
}

/** The list under `key` of a reply. */
export function list(body: Body, key: string): Body[] {
  const value = body[key];
  if (!Array.isArray(value)) throw new Error(`no list ${key} in ${JSON.stringify(body)}`);
  return value as Body[];
}

/** A nested object of a reply, such as the `equipment` of a create. */
export function object(body: Body, key: string): Body {
  const value = body[key];
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(`no object ${key} in ${JSON.stringify(body)}`);
  return value as Body;
}
