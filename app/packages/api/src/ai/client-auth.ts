import {
  AI_SCOPES,
  accountFromClaims,
  appError,
  authorizeClient,
  type AiRights,
  type Authorized,
  type AiLogStore,
  type ConnectionStore,
  checkDailyLimit,
  DEFAULT_DAILY_LIMIT,
} from "@pflanzendex/core";
import { admitAccount } from "@pflanzendex/db";
import type { MiddlewareHandler } from "hono";
import type { Pool } from "pg";
import { errorBody, statusFor, type AuthEnv, type FeatureAccess } from "../kernel";
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
  /** The log counts the calls for the daily limit per connection (US-KI-06). */
  readonly log?: Pick<AiLogStore, "countSince">;
  /** Calls per connection and UTC day; default `DEFAULT_DAILY_LIMIT` (assumption). */
  readonly dailyLimit?: number;
  /** While "ai" is off for the account the interface answers 404, like a path that does not exist (US-DEV-06). */
  readonly features?: FeatureAccess;
}

/** The refusal for a connection over its daily limit, with `Retry-After` in seconds (US-KI-06), else `null`. */
async function overLimit(opt: ClientGuardOptions, userId: string, connectionId: string, now: Date) {
  if (!opt.log) return null;
  const r = await checkDailyLimit(opt.log, {
    userId,
    connectionId,
    now,
    limit: opt.dailyLimit ?? DEFAULT_DAILY_LIMIT,
  });
  if (r.ok) return null;
  const wait = Math.max(1, Math.ceil(((r.retryAt?.getTime() ?? 0) - now.getTime()) / 1000));
  return { error: r.error, headers: { "Retry-After": String(wait) } };
}

/** Whether the function group "ai" is off for the account (US-DEV-06); without a switch it is on. */
const aiIsOff = async (opt: ClientGuardOptions, id: string) =>
  opt.features !== undefined && !(await opt.features.enabled("ai", id));

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
    if (await aiIsOff(opt, id)) return c.notFound();
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
    const limited = await overLimit(opt, id, r.value.connection.id, clock());
    if (limited) return c.json(errorBody(limited.error), statusFor(limited.error), limited.headers);
    c.set("account", { id, data });
    c.set("ai", r.value);
    await next();
  };
}
