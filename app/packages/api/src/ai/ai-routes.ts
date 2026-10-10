import {
  AI_SCOPES,
  aiAllowAgain,
  aiConnections,
  aiRevoke,
  aiSetRights,
  type ConnectionStore,
} from "@pflanzendex/core";
import { ConnectionsPostgres, IdempotencyPostgres } from "@pflanzendex/db";
import { Hono, type MiddlewareHandler } from "hono";
import type { Pool } from "pg";
import { body, write, type AuthEnv } from "../kernel";
import type { TokenVerifier } from "../account";
import { clientAuthentication, type AiEnv } from "./client-auth";

/** Paths the sign-in guard of the web app (bearer token) must cover: the keeper's list of connections. */
const KEEPER_PATHS = ["/ai/connections"] as const;
export const WELL_KNOWN = "/.well-known/oauth-protected-resource";

export interface AiAccessOptions {
  /** Verifies the tokens of AI clients (audience = `resource`). */
  readonly verifier: TokenVerifier;
  /** The address of the AI interface (the audience of its tokens, RFC 8707), e.g. `https://example/mcp`. */
  readonly resource: string;
  /** The authorization server (E-03, FR-KI-13): the sign-in service. The app builds none of its own. */
  readonly issuer: string;
  readonly clock?: () => Date;
  /** Replaces the PostgreSQL adapter (tests only). */
  readonly connections?: ConnectionStore;
}

/**
 * Access of the keeper's AI client (epic KI, US-KI-07), always for one account (P-04, P-05, KI-R6).
 *
 * Keeper side (web token): `GET /ai/connections` lists the connected clients (name, rights, since, last use, a pending
 * request for a higher right, revoked ones included); `PUT /ai/connections/:id/rights`, `POST /ai/connections/:id/revoke`
 * and `POST /ai/connections/:id/allow-again` change them. Managing connections is never released to a connection itself
 * (FR-KI-10): the AI audience has no route here.
 *
 * Client side (AI token): `GET /mcp/session` tells a connected client its name and effective rights;
 * `/.well-known/oauth-protected-resource` (RFC 9728) points the client to the authorization server.
 */
export function aiAccessRoutes(
  pool: Pool,
  auth: MiddlewareHandler<AuthEnv>,
  opt: AiAccessOptions | undefined,
): Hono<AuthEnv> {
  if (!opt) return new Hono<AuthEnv>();
  const connections = opt.connections ?? new ConnectionsPostgres(pool);
  const deps = { connections };
  const writes = { idempotency: new IdempotencyPostgres(pool) };
  const metadataUrl = `${new URL(opt.resource).origin}${WELL_KNOWN}`;
  const routes = new Hono<AuthEnv>();
  const client = new Hono<AiEnv>();

  for (const path of KEEPER_PATHS) routes.use(path, auth).use(`${path}/*`, auth);
  routes.get("/ai/connections", async (c) =>
    c.json({ connections: await aiConnections(deps, c.get("account").id) }),
  );
  routes.put("/ai/connections/:id/rights", async (c) =>
    write(c, writes, aiSetRights(deps), { input: { ...(await body(c)), id: c.req.param("id") } }),
  );
  routes.post("/ai/connections/:id/revoke", async (c) =>
    write(c, writes, aiRevoke(deps, opt.clock), { input: { id: c.req.param("id") } }),
  );
  routes.post("/ai/connections/:id/allow-again", async (c) =>
    write(c, writes, aiAllowAgain(deps, opt.clock), {
      input: { id: c.req.param("id") },
      success: 201,
    }),
  );

  client.get(WELL_KNOWN, (c) =>
    c.json({
      resource: opt.resource,
      authorization_servers: [opt.issuer],
      scopes_supported: Object.values(AI_SCOPES),
      bearer_methods_supported: ["header"],
    }),
  );
  const guard = {
    verifier: opt.verifier,
    pool,
    connections,
    metadataUrl,
    ...(opt.clock ? { clock: opt.clock } : {}),
  };
  client.get("/mcp/session", clientAuthentication(guard, "read"), (c) => {
    const { connection, rights } = c.get("ai");
    return c.json({ client: connection.clientName, rights });
  });
  routes.route("/", client);
  return routes;
}

export { clientAuthentication } from "./client-auth";
export type { AiEnv } from "./client-auth";
