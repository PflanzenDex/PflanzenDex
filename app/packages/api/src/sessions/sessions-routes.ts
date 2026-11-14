import { sessionsNotConfigured, signOutEverywhere, type IdentitySessions } from "@pflanzendex/core";
import { IdempotencyPostgres } from "@pflanzendex/db";
import { Hono } from "hono";
import type { Pool } from "pg";
import { write, type AuthEnv } from "../kernel";

/**
 * Sign out on all devices (US-ACC-01, issue 2065): `POST /account/sessions/end` (`Idempotency-Key`, no body) ends every
 * session of the signed-in keeper at the sign-in service. The subject is the one of the verified token and never the
 * body's; the path sits behind the sign-in guard of `/account/*`, so a request without a valid token answers 401 first.
 * Without the identity settings the answer is 503 `account.sign_out_everywhere_unavailable`.
 */
export function sessionRoutes(
  pool: Pool,
  identity: IdentitySessions = sessionsNotConfigured,
): Hono<AuthEnv> {
  const deps = { idempotency: new IdempotencyPostgres(pool) };
  const end = signOutEverywhere({ identity });
  const routes = new Hono<AuthEnv>();
  routes.post("/sessions/end", async (c) =>
    write(c, deps, end, { input: { subject: c.get("account").data.subject } }),
  );
  return routes;
}
