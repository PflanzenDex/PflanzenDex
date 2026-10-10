import {
  AI_SCOPES,
  aiStatus,
  type DraftStore,
  type DraftTypes,
  type AiLogStore,
  type ConnectionStore,
  type PhotoSource,
  type StatusSource,
} from "@pflanzendex/core";
import { Hono } from "hono";
import type { Pool } from "pg";
import { errorBody, statusFor } from "../kernel";
import { clientPhotoRoutes } from "./client-photo-routes";
import { clientDraftRoutes } from "./client-draft-routes";
import { clientAuthentication, type AiEnv } from "./client-auth";
import type { AiAccessOptions } from "./ai-routes";

export const WELL_KNOWN = "/.well-known/oauth-protected-resource";

/**
 * Client side of the AI interface (AI token): the protected resource metadata (RFC 9728), the session of the
 * connection (US-KI-07) and the daily status (US-KI-02). Every route runs behind the guard of its right (KI-R8).
 */
export function clientRoutes(
  pool: Pool,
  opt: AiAccessOptions,
  stores: {
    connections: ConnectionStore;
    log: AiLogStore;
    status: StatusSource;
    photo: PhotoSource;
    drafts: DraftStore;
    types: DraftTypes;
  },
): Hono<AiEnv> {
  const { connections, log, status, drafts, types, photo } = stores;
  const client = new Hono<AiEnv>();
  const clock = opt.clock ?? (() => new Date());
  const metadataUrl = `${new URL(opt.resource).origin}${WELL_KNOWN}`;
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
        now: (opt.clock ?? (() => new Date()))(),
      },
    );
    return r.ok ? c.json(r.value) : c.json(errorBody(r.error), statusFor(r.error));
  });
  client.route("/", clientPhotoRoutes(guard, { photo, log }, clock));
  client.route("/", clientDraftRoutes(guard, { drafts, types, log }, clock));
  return client;
}
