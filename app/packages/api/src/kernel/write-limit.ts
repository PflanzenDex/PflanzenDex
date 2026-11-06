import type { Context, MiddlewareHandler } from "hono";
import { appError } from "@pflanzendex/core";
import { errorBody, statusFor } from "./error-http";

/** `max` counted hits per `windowMs` (a fixed window). */
export type WriteLimit = { max: number; windowMs: number };

/**
 * Writes per client and minute before `request.rate_limited` (TE-03, #762; starting value, assumption): far above
 * what a person does by hand, low enough that a runaway script cannot flood the database.
 */
export const WRITE_LIMIT: WriteLimit = { max: 120, windowMs: 60_000 };

/**
 * Redeeming an invitation code per subject and per address (US-ACC-05, issue 305). Starting values, assumption: 5
 * attempts per subject and 20 per address and minute. A code has 120 bits, so this does not stop guessing; it bounds
 * the database work, because every attempt costs a transaction. The address limit holds while subjects are cheap
 * (open self-registration at the sign-in service, #301); 20 leaves room for several people behind one router. Only a
 * verified subject is counted. `now` injects the clock (tests).
 */
export type RedeemLimit = { subject: WriteLimit; address: WriteLimit; now?: () => number };
export const REDEEM_LIMIT: RedeemLimit = {
  subject: { max: 5, windowMs: 60_000 },
  address: { max: 20, windowMs: 60_000 },
};

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
 * A fixed window per key, kept in memory of this API process: `limit.max` counted hits per `limit.windowMs`. `room`
 * gives the seconds to wait when the key is full (`undefined` while it has room); `count` counts one hit.
 */
function fixedWindows(limit: WriteLimit) {
  const windows = new Map<string, { start: number; count: number }>();
  const sweep = (t: number) => {
    for (const [key, w] of windows) if (t - w.start >= limit.windowMs) windows.delete(key);
    // Still full of live windows: start over rather than grow without bound.
    if (windows.size >= MAX_CLIENTS) windows.clear();
  };
  const live = (key: string, t: number) => {
    const w = windows.get(key);
    return w && t - w.start < limit.windowMs ? w : undefined;
  };
  return {
    room(key: string, t: number): number | undefined {
      const w = live(key, t);
      if (!w || w.count < limit.max) return undefined;
      return Math.max(1, Math.ceil((w.start + limit.windowMs - t) / 1000));
    },
    count(key: string, t: number): void {
      let w = live(key, t);
      if (!w) {
        if (!windows.has(key) && windows.size >= MAX_CLIENTS) sweep(t);
        w = { start: t, count: 0 };
        windows.set(key, w);
      }
      w.count += 1;
    },
  };
}

/** The answer of a refused request: 429 `request.rate_limited` with `Retry-After` in seconds (TE-03, US-ACC-05). */
export function rateLimited(c: Context, retryAfter: number) {
  const failure = appError("request.rate_limited");
  c.header("Retry-After", String(retryAfter));
  return c.json(errorBody(failure), statusFor(failure));
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
  const windows = fixedWindows(limit);
  return async (c, next) => {
    if (!WRITES.has(c.req.method)) return next();
    const t = now();
    const key = clientKey(c.req.header("Authorization"), c.req.header("X-Forwarded-For"));
    const wait = windows.room(key, t);
    if (wait !== undefined) return rateLimited(c, wait);
    windows.count(key, t);
    return next();
  };
}

/**
 * The limit of redeeming invitation codes (US-ACC-05, issue 305). Called with the subject of a verified token and the
 * first address of `X-Forwarded-For`; the subject is checked first. A refused attempt returns the seconds to wait and
 * counts nowhere. An admitted one counts for its subject and its address before the database is asked, so concurrent
 * attempts cannot pass together. Without an address all attempts share one counter, as writeLimit does.
 */
export function redeemGate(
  limit: RedeemLimit = REDEEM_LIMIT,
): (subjectId: string, forwardedFor: string | undefined) => number | undefined {
  const subjects = fixedWindows(limit.subject);
  const addresses = fixedWindows(limit.address);
  const now = limit.now ?? Date.now;
  return (subjectId, forwardedFor) => {
    const t = now();
    const address = clientKey(undefined, forwardedFor);
    const wait = subjects.room(subjectId, t) ?? addresses.room(address, t);
    if (wait !== undefined) return wait;
    subjects.count(subjectId, t);
    addresses.count(address, t);
    return undefined;
  };
}
