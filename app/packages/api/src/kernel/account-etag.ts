import type { MiddlewareHandler } from "hono";
import { RETAINED_304_HEADERS, etag } from "hono/etag";
import type { AuthEnv } from "./auth-env";

/** The cache rule of an answer of the account that has none of its own (NFR-12, issue 1244). */
const PRIVATE_RULE = "private, no-cache";

/**
 * What a `304` keeps: hono/etag drops every other header, which would also drop the CORS headers set by the cors
 * middleware, and the browser then refuses the revalidated copy (the web app runs on another origin).
 */
const KEPT_ON_304 = [
  ...RETAINED_304_HEADERS,
  "access-control-allow-origin",
  "access-control-allow-credentials",
  "access-control-expose-headers",
];

/**
 * The digest of one answer of one account. The account is part of the input, so the ETag of one account never matches
 * the answer of another, even when the two bodies are equal (e.g. two empty lists).
 */
function accountDigest(account: string, body: Uint8Array): Promise<ArrayBuffer> {
  const head = new TextEncoder().encode(`${account}\n`);
  const joined = new Uint8Array(head.length + body.length);
  joined.set(head, 0);
  joined.set(body, head.length);
  return crypto.subtle.digest("SHA-256", joined);
}

/**
 * Conditional GET for the answers of the account (NFR-12, issue 1244): data that did not change is answered with `304`
 * and no body, so the browser keeps its copy and moves no bytes. The answer stays private: no shared cache may keep it
 * (`private, no-cache`), the browser keys its copy by the token (`Vary: Authorization`), and the ETag belongs to the
 * account (`accountDigest`), so a `304` is only ever answered to the account whose body it describes.
 *
 * Only `200` answers of the account get the rule and an ETag (`hono/etag` answers nothing else, so errors stay as they
 * are). An answer with a cache rule of its own keeps it and gets no ETag here: photos (`private, max-age`) and exports
 * or operator data (`no-store`).
 */
export function accountEtag(): MiddlewareHandler<AuthEnv> {
  return async (c, next) => {
    await next();
    const account = c.get("account");
    if (c.req.method !== "GET" || !c.res.ok || !account) return;
    if (c.res.headers.has("cache-control")) return;
    c.res.headers.set("cache-control", PRIVATE_RULE);
    c.res.headers.append("vary", "Authorization");
    await etag({
      retainedHeaders: KEPT_ON_304,
      generateDigest: (body) => accountDigest(account.id, body),
    })(c, async () => {});
    // A `304` carries only the ETag from hono/etag; RFC 9110 asks that the rule and the vary are repeated.
    if (c.res.status === 304) {
      c.res.headers.set("cache-control", PRIVATE_RULE);
      c.res.headers.set("vary", "Authorization");
    }
  };
}
