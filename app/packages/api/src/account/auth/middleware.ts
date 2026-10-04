import {
  appError,
  mayShareWithFriends,
  accountFromClaims,
  type AccountData,
} from "@pflanzendex/core";
import { admitAccount } from "@pflanzendex/db";
import type { MiddlewareHandler } from "hono";
import type { Pool } from "pg";
import { errorBody, statusFor, type AuthEnv } from "../../kernel";
import type { TokenVerifier } from "./token";

export const notSignedIn = (c: Parameters<MiddlewareHandler>[0]) =>
  c.json({ error: { code: "not_signed_in" } }, 401, {
    // Deliberately without an error reason (error="invalid_token" etc.): failures reveal nothing about accounts.
    "WWW-Authenticate": "Bearer",
  });

export type AuthOptions = {
  /** Forces the registration mode for this app instance (tests); without it the operator's setting decides. */
  invitationOnly?: boolean;
};

/** The verified identity of the bearer token, or `null`. The reason of a failure is never passed on. */
export async function verifiedIdentity(
  c: Parameters<MiddlewareHandler>[0],
  verifier: TokenVerifier,
): Promise<AccountData | null> {
  const header = c.req.header("authorization") ?? "";
  const token = /^Bearer\s+(\S+)$/i.exec(header)?.[1];
  if (!token) return null;
  const claims = await verifier(token);
  return claims && accountFromClaims(claims);
}

/**
 * Requires a valid bearer token, creates the account on first sign-in (own path via the subject) and provides the
 * account id for the request. While the operator has set registration to "invitation only" (US-ACC-05), a subject
 * without account gets 403 `invitation.required` and nothing is created; it registers via `/registration/invitation`.
 * Data access afterwards goes only through `withAccount` (P-03, P-04).
 */
export function authentication(
  verifier: TokenVerifier,
  pool: Pool,
  opt: AuthOptions = {},
): MiddlewareHandler<AuthEnv> {
  const override =
    opt.invitationOnly === undefined ? undefined : { invitationOnly: opt.invitationOnly };
  return async (c, next) => {
    const data = await verifiedIdentity(c, verifier);
    if (!data) return notSignedIn(c);
    const id = await admitAccount(pool, data.subject, override);
    if (id === null) {
      const required = appError("invitation.required");
      return c.json(errorBody(required), statusFor(required));
    }
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
