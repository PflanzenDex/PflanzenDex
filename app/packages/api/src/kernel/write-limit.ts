import type { MiddlewareHandler } from "hono";
import { appError } from "@pflanzendex/core";
import { errorBody, statusFor } from "./error-http";

export type WriteLimit = { max: number; windowMs: number };

/**
 * Writes per client and minute before `request.rate_limited` (TE-03, #762; starting value, assumption): far above
 * what a person does by hand, low enough that a runaway script cannot flood the database.
 */
export const WRITE_LIMIT: WriteLimit = { max: 120, windowMs: 60_000 };
const WRITES = new Set(["POST", "PUT", "PATCH", "DELETE"]);
/** Upper bound of tracked clients; expired windows are dropped first, so memory stays bounded (assumption). */
const MAX_CLIENTS = 10_000;

/** The `sub` of a bearer token, read without verifying it: it only picks the counter, authentication still checks it. */
function subject(authorization: string | undefined): string | undefined {
  const payload = /^Bearer [^.\s]+\.([^.\s]+)\.[^.\s]*$/.exec(authorization ?? "")?.[1];
  if (!payload) return undefined;
  try {
    const sub = (JSON.parse(Buffer.from(payload, "base64url").toString()) as { sub?: unknown }).sub;
    return typeof sub === "string" && sub ? sub : undefined;
  } catch {
    // Not a JWT: counted by address; authentication answers 401 anyway.
    return undefined;
  }
}

/**
 * The client a write counts for: the signed-in subject, otherwise the first address of `X-Forwarded-For` (the proxy
 * sets it and trusts forwarded headers only from its own front proxy), otherwise one shared counter.
 */
export function clientKey(
  authorization: string | undefined,
  forwardedFor: string | undefined,
): string {
  const sub = subject(authorization);
  if (sub) return `sub:${sub}`;
  const address = forwardedFor?.split(",")[0]?.trim();
  return address ? `ip:${address}` : "unknown";
}

/**
 * Basic per-client limit on write requests (TE-03, #762): a fixed window per client, kept in memory of this API
 * process. Reads, preflights and the health check are not counted. Over the limit: 429 `request.rate_limited` with
 * `Retry-After` in seconds.
 */
export function writeLimit(
  limit: WriteLimit = WRITE_LIMIT,
  now: () => number = Date.now,
): MiddlewareHandler {
  const windows = new Map<string, { start: number; count: number }>();
  const sweep = (t: number) => {
    for (const [key, w] of windows) if (t - w.start >= limit.windowMs) windows.delete(key);
    // Still full of live windows: start over rather than grow without bound.
    if (windows.size >= MAX_CLIENTS) windows.clear();
  };
  return async (c, next) => {
    if (!WRITES.has(c.req.method)) return next();
    const t = now();
    const key = clientKey(c.req.header("Authorization"), c.req.header("X-Forwarded-For"));
    let w = windows.get(key);
    if (!w || t - w.start >= limit.windowMs) {
      if (!w && windows.size >= MAX_CLIENTS) sweep(t);
      w = { start: t, count: 0 };
      windows.set(key, w);
    }
    w.count += 1;
    if (w.count <= limit.max) return next();
    const failure = appError("request.rate_limited");
    c.header("Retry-After", String(Math.max(1, Math.ceil((w.start + limit.windowMs - t) / 1000))));
    return c.json(errorBody(failure), statusFor(failure));
  };
}
