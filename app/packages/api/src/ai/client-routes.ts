import {
  AI_SCOPES,
  aiStatus,
  aiDrafts,
  aiLog,
  ok,
  type AppAreaReadSource,
  type AreaReadSource,
  productTitle,
  type CollectionReadSource,
  type DiscoverSource,
  type DraftStore,
  type DraftTypes,
  type AiLogStore,
  type ConnectionStore,
  type PhotoSource,
  type SourceClient,
  type StatusSource,
  type TaskStore,
  type SpecimenWriteSource,
} from "@pflanzendex/core";
import { Hono } from "hono";
import type { Pool } from "pg";
import { errorBody, statusFor } from "../kernel";
import { clientResearchRoutes } from "./research/client-research-routes";
import { clientDiscoverRoutes } from "./discover/client-discover-routes";
import { clientReadRoutes } from "./reads/client-read-routes";
import { clientRulesRoutes } from "./reads/rules-routes";
import { clientTaskRoutes } from "./tasks/client-task-routes";
import { clientDraftRoutes } from "./drafts/client-draft-routes";
import { clientWriteRoutes } from "./drafts/client-write-routes";
import { clientAuthentication, type AiEnv } from "./guard/client-auth";
import type { AiAccessOptions } from "./ai-routes";
import { mcpRoutes } from "./mcp/mcp-routes";

export const WELL_KNOWN = "/.well-known/oauth-protected-resource";

/**
 * The address of the protected resource metadata next to the interface: `https://host/api/mcp` names
 * `https://host/api/.well-known/oauth-protected-resource`, which the proxy forwards to the API's `WELL_KNOWN`
 * (`/api/x` becomes `/x`); `http://localhost:3000/mcp` names `http://localhost:3000/.well-known/...`.
 */
export const metadataUrlOf = (resource: string) => new URL(`.${WELL_KNOWN}`, resource).toString();

/** What the client routes read from: the stores of the connection, drafts and tasks and the ports of the app. */
export interface ClientStores {
  connections: ConnectionStore;
  log: AiLogStore;
  status: StatusSource;
  photo: PhotoSource;
  drafts: DraftStore;
  types: DraftTypes;
  tasks: TaskStore;
  discover: DiscoverSource;
  /** The reads of the catalog and the collection (US-KI-11), over the same functions as the app's routes. */
  collection: CollectionReadSource;
  /** The write tools of the specimens (US-KI-14), over the operations of the app's routes (KI-R10). */
  writes: SpecimenWriteSource;
  /** Every other area (US-KI-12), over the same functions as the app's routes. */
  areas: AppAreaReadSource;
  sources?: SourceClient;
}

/** RFC 9728: the metadata at the address the challenge names and at the path-inserted well-known address of the resource. */
function metadataRoutes(client: Hono<AiEnv>, opt: AiAccessOptions) {
  const resourcePath = new URL(opt.resource).pathname.replace(/\/$/, "");
  for (const path of [WELL_KNOWN, `${WELL_KNOWN}${resourcePath}`])
    client.get(path, (c) =>
      c.json({
        resource: opt.resource,
        authorization_servers: [opt.issuer],
        scopes_supported: Object.values(AI_SCOPES),
        bearer_methods_supported: ["header"],
        resource_name: productTitle(),
      }),
    );
}

/**
 * Client side of the AI interface (AI token): the protected resource metadata (RFC 9728), the session of the
 * connection (US-KI-07), the daily status (US-KI-02), research, drafts, Discover, tasks, the catalog and the collection (US-KI-11), and the MCP endpoint
 * `POST /mcp` that offers them as tools. Every route runs behind the guard of its right (KI-R8).
 */
export function clientRoutes(pool: Pool, opt: AiAccessOptions, stores: ClientStores): Hono<AiEnv> {
  const { connections, log, status, drafts, types, tasks, discover } = stores;
  const client = new Hono<AiEnv>();
  const clock = opt.clock ?? (() => new Date());
  const metadataUrl = metadataUrlOf(opt.resource);
  metadataRoutes(client, opt);
  const guard = {
    verifier: opt.verifier,
    pool,
    connections,
    metadataUrl,
    log,
    ...(opt.features ? { features: opt.features } : {}),
    ...(opt.dailyLimit === undefined ? {} : { dailyLimit: opt.dailyLimit }),
    ...(opt.clock ? { clock: opt.clock } : {}),
  };
  client.get("/mcp/session", clientAuthentication(guard, "read"), (c) => {
    const { connection, rights } = c.get("ai");
    return c.json({ client: connection.clientName, rights });
  });
  // US-KI-02: the daily status of the connected account, from the same function as "Today" (read right).
  client.get("/mcp/status", clientAuthentication(guard, "read"), async (c) => {
    const { connection, rights } = c.get("ai");
    const r = await aiStatus(
      { status, log },
      {
        userId: c.get("account").id,
        connectionId: connection.id,
        rights,
        timeZone: c.req.query("timeZone"),
        now: clock(),
      },
    );
    return r.ok ? c.json(r.value) : c.json(errorBody(r.error), statusFor(r.error));
  });
  client.route("/", clientResearchRoutes(guard, stores, clock));
  client.route("/", clientDraftRoutes(guard, { drafts, types, log, tasks }, clock));
  client.route("/", clientDiscoverRoutes(guard, { discover, drafts, log }, clock));
  client.route("/", clientReadRoutes(guard, readStores(stores, clock), clock));
  client.route("/", clientWriteRoutes(guard, stores, clock));
  client.route("/", clientTaskRoutes(guard, { tasks, log }, opt.resource, clock));
  client.route("/", clientRulesRoutes(guard, { log }, stores.sources !== undefined, clock));
  // The MCP endpoint (E-04): JSON-RPC tools over the routes above, with the caller's token and the same guards.
  client.route(
    "/",
    mcpRoutes(guard, {
      routes: client,
      origins: [new URL(opt.resource).origin, ...(opt.allowedOrigins ?? [])],
      version: opt.version ?? "unknown",
      sources: stores.sources !== undefined,
    }),
  );
  return client;
}

/** The collection and the app's areas plus the own connection's entries of the AI log and drafts (US-KI-12, P-04). */
function readStores(stores: ClientStores, clock: () => Date) {
  const areas: AreaReadSource = {
    ...stores.areas,
    list_ai_log: async (userId, q) =>
      ok({
        log: (await aiLog(stores, userId)).filter((e) => e.connectionId === q.connectionId),
      }),
    list_ai_drafts: async (userId, q) =>
      ok({
        drafts: (await aiDrafts(stores, userId, clock())).filter(
          (d) => d.connectionId === q.connectionId,
        ),
      }),
  };
  return { collection: stores.collection, areas, log: stores.log };
}
