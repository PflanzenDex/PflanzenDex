import { registerWithInvitation } from "@pflanzendex/core";
import { AccessPostgres } from "@pflanzendex/db";
import { Hono } from "hono";
import type { Pool } from "pg";
import { errorBody, rateLimited, redeemGate, statusFor } from "../kernel";
import { notSignedIn, verifiedIdentity } from "./auth/middleware";
import type { TokenVerifier } from "./auth/token";

/**
 * Registration with an invitation code (US-ACC-05). The caller proves its identity with the bearer token; there is
 * no account yet, so this is the one write without account context (and so without an idempotency key): it is
 * naturally repeatable, because a subject with an account uses up no further code.
 * - POST /registration/invitation `{ code }`: 200 `{ registered }`, or 403 `invitation.invalid` for any code that is
 *   unknown, used, expired or malformed (the same answer for all, so it is no oracle for guessing codes)
 * - 429 `request.rate_limited` with `Retry-After` when `redeem` refuses the attempt (issue 305): then nothing reaches
 *   the database. Without `redeem` nothing is limited.
 */
export function registrationRoutes(
  pool: Pool,
  verifier: TokenVerifier,
  redeem?: ReturnType<typeof redeemGate>,
): Hono {
  const register = registerWithInvitation({ access: new AccessPostgres(pool) });
  const routes = new Hono();
  routes.post("/registration/invitation", async (c) => {
    const identity = await verifiedIdentity(c, verifier);
    if (!identity) return notSignedIn(c);
    const wait = redeem?.(identity.subject, c.req.header("X-Forwarded-For"));
    if (wait !== undefined) return rateLimited(c, wait);
    const given: unknown = await c.req.json().catch(() => null);
    const code =
      given && typeof given === "object" ? (given as Record<string, unknown>)["code"] : undefined;
    const r = await register({ subject: identity.subject, code });
    return r.ok ? c.json(r.value) : c.json(errorBody(r.error), statusFor(r.error));
  });
  return routes;
}
