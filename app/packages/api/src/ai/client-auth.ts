import {
  AI_SCOPES,
  accountFromClaims,
  appError,
  authorizeClient,
  type AiRights,
  type Authorized,
  type ConnectionStore,
} from "@pflanzendex/core";
import { admitAccount } from "@pflanzendex/db";
import type { MiddlewareHandler } from "hono";
import type { Pool } from "pg";
import { errorBody, statusFor, type AuthEnv } from "../kernel";
import type { TokenVerifier } from "../account";

export type AiEnv = {
  Variables: AuthEnv["Variables"] & { ai: Authorized };
};

export interface ClientGuardOptions {
  /** Verifies tokens whose audience is the AI interface (the MCP URL, RFC 8707), never the web app's tokens. */
  readonly verifier: TokenVerifier;
  readonly pool: Pool;
  readonly connections: ConnectionStore;
  /** Address of the protected resource metadata (RFC 9728), named in every challenge. */
  readonly metadataUrl: string;
  readonly clock?: () => Date;
}

const challenge = (metadataUrl: string, extra = "") =>
  `Bearer ${extra}resource_metadata="${metadataUrl}"`;

/**
 * The guard of the AI interface (US-KI-07, KI-R6, KI-R8): a valid access token for the AI audience, the account of its
 * subject, then the connection of the calling client with its rights. The server enforces rights and revocation on every
 * call, whatever the client asks its keeper (FR-KI-08). `needs` is the right of the operation behind the route
 * (`rightNeeded`). An insufficient right answers 403 `insufficient_scope` with the scope to request (step-up).
 * Failures of the token reveal nothing about accounts.
 */
export function clientAuthentication(
  opt: ClientGuardOptions,
  needs: AiRights,
): MiddlewareHandler<AiEnv> {
  const clock = opt.clock ?? (() => new Date());
  return async (c, next) => {
    const token = /^Bearer\s+(\S+)$/i.exec(c.req.header("authorization") ?? "")?.[1];
    const claims = token ? await opt.verifier(token) : null;
    const data = claims && accountFromClaims(claims);
    if (!claims || !data)
      return c.json({ error: { code: "not_signed_in" } }, 401, {
        "WWW-Authenticate": challenge(opt.metadataUrl),
      });
    const id = await admitAccount(opt.pool, data.subject);
    if (id === null) {
      const required = appError("invitation.required");
      return c.json(errorBody(required), statusFor(required));
    }
    const clientId = typeof claims["azp"] === "string" ? claims["azp"] : "";
    if (clientId === "")
      return c.json({ error: { code: "not_signed_in" } }, 401, {
        "WWW-Authenticate": challenge(opt.metadataUrl),
      });
    const name = typeof claims["client_name"] === "string" ? claims["client_name"] : clientId;
    const r = await authorizeClient(
      { connections: opt.connections },
      { userId: id, clientId, clientName: name, scope: claims["scope"], needs, now: clock() },
    );
    if (!r.ok) {
      const headers =
        r.error.code === "ai.scope_insufficient"
          ? {
              "WWW-Authenticate": challenge(
                opt.metadataUrl,
                `error="insufficient_scope", scope="${AI_SCOPES[needs]}", `,
              ),
            }
          : {};
      return c.json(errorBody(r.error), statusFor(r.error), headers);
    }
    c.set("account", { id, data });
    c.set("ai", r.value);
    await next();
  };
}
