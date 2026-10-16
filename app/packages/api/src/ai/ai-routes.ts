import {
  aiAllowAgain,
  aiConnections,
  aiRevoke,
  aiSetRights,
  type DiscoverSource,
  type PhotoSource,
  type StatusSource,
  type ConnectionStore,
} from "@pflanzendex/core";
import {
  AiLogPostgres,
  ConnectionsPostgres,
  DraftsPostgres,
  IdempotencyPostgres,
  TasksPostgres,
} from "@pflanzendex/db";
import { Hono, type MiddlewareHandler } from "hono";
import type { Pool } from "pg";
import { body, featureGate, write, type AuthEnv, type FeatureAccess } from "../kernel";
import type { TokenVerifier } from "../account";
import { clientRoutes } from "./client-routes";
import { draftRoutes } from "./drafts/draft-routes";
import { draftTypes } from "./drafts/draft-types";
import { taskRoutes } from "./tasks/task-routes";

/** Paths the sign-in guard of the web app (bearer token) must cover: the keeper's list of connections. */
const KEEPER_PATHS = ["/ai/connections", "/ai/log", "/ai/drafts", "/ai/tasks"] as const;
export interface AiAccessOptions {
  /** Verifies the tokens of AI clients (audience = `resource`). */
  readonly verifier: TokenVerifier;
  /** The address of the AI interface (the audience of its tokens, RFC 8707), e.g. `https://example/mcp`. */
  readonly resource: string;
  /** The authorization server (E-03, FR-KI-13): the sign-in service. The app builds none of its own. */
  readonly issuer: string;
  readonly clock?: () => Date;
  /** Calls per AI connection and UTC day (US-KI-06); default 500 (assumption). */
  readonly dailyLimit?: number;
  /** Replaces the PostgreSQL adapter (tests only). */
  readonly connections?: ConnectionStore;
  /** The feature switch (US-DEV-06): while "ai" is off for the account every route of the interface answers 404. */
  readonly features?: FeatureAccess;
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
  ports: { status: StatusSource; photo: PhotoSource; discover: DiscoverSource },
): Hono<AuthEnv> {
  if (!opt) return new Hono<AuthEnv>();
  const connections = opt.connections ?? new ConnectionsPostgres(pool);
  const log = new AiLogPostgres(pool);
  const deps = { connections };
  const writes = { idempotency: new IdempotencyPostgres(pool) };
  const routes = new Hono<AuthEnv>();

  for (const path of KEEPER_PATHS) {
    routes.use(path, auth).use(`${path}/*`, auth);
    if (opt.features) {
      const gate = featureGate(opt.features, "ai");
      routes.use(path, gate).use(`${path}/*`, gate);
    }
  }
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

  const clock = opt.clock ?? (() => new Date());
  const drafts = new DraftsPostgres(pool);
  routes.route(
    "/",
    draftRoutes(pool, { drafts, types: draftTypes(pool, ports.discover), log }, clock),
  );
  const tasks = new TasksPostgres(pool);
  routes.route("/", taskRoutes(pool, { tasks, connections }, opt.resource, clock));
  routes.route(
    "/",
    clientRoutes(pool, opt, {
      connections,
      log,
      ...ports,
      drafts,
      types: draftTypes(pool, ports.discover),
      tasks,
    }),
  );
  return routes;
}
