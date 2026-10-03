import { mayShareWithFriends, accountFromClaims } from "@pflanzendex/core";
import { findOrCreateAccount } from "@pflanzendex/db";
import type { MiddlewareHandler } from "hono";
import type { Pool } from "pg";
import type { AuthEnv } from "../../kernel";
import type { TokenVerifier } from "./token";

const notSignedIn = (c: Parameters<MiddlewareHandler>[0]) =>
  c.json({ error: { code: "not_signed_in" } }, 401, {
    // Deliberately without an error reason (error="invalid_token" etc.): failures reveal nothing about accounts.
    "WWW-Authenticate": "Bearer",
  });

/**
 * Requires a valid bearer token, creates the account on first sign-in (own path via the subject)
 * and provides the account id for the request. Data access afterwards goes only through `withAccount` (P-03, P-04).
 */
export function authentication(reviewer: TokenVerifier, pool: Pool): MiddlewareHandler<AuthEnv> {
  return async (c, next) => {
    const header = c.req.header("authorization") ?? "";
    const token = /^Bearer\s+(\S+)$/i.exec(header)?.[1];
    if (!token) return notSignedIn(c);
    const claims = await reviewer(token);
    const data = claims && accountFromClaims(claims);
    if (!data) return notSignedIn(c);
    const id = await findOrCreateAccount(pool, data.subject);
    c.set("account", { id, data });
    await next();
  };
}

/** Sharing with friends exists only with a confirmed email address (US-ACC-01). */
export const onlyWithConfirmedEmail: MiddlewareHandler<AuthEnv> = async (c, next) => {
  if (!mayShareWithFriends(c.get("account").data))
    return c.json({ error: { code: "email_unbestaetigt" } }, 403);
  await next();
};
