import {
  aiAdoptDraft,
  aiDiscardDraft,
  aiDrafts,
  aiLog,
  type AiLogStore,
  type DraftStore,
  type DraftTypes,
} from "@pflanzendex/core";
import { IdempotencyPostgres } from "@pflanzendex/db";
import { Hono } from "hono";
import type { Pool } from "pg";
import { body, write, type AuthEnv } from "../kernel";

/**
 * The keeper's side of drafts and the log (US-KI-09, US-KI-10); the sign-in guard of the web app is applied by the
 * caller. `GET /ai/drafts` is the inbox (also adopted, discarded and expired ones stay viewable);
 * `POST /ai/drafts/:id/adopt` adopts the draft, with `{content}` the keeper's changed version, through the validating
 * operation of the form; `POST /ai/drafts/:id/discard` discards it. `GET /ai/log` lists what connections did.
 */
export function draftRoutes(
  pool: Pool,
  stores: { drafts: DraftStore; types: DraftTypes; log: AiLogStore },
  clock: () => Date,
): Hono<AuthEnv> {
  const { drafts, types, log } = stores;
  const deps = { drafts, types };
  const writes = { idempotency: new IdempotencyPostgres(pool) };
  const routes = new Hono<AuthEnv>();
  routes.get("/ai/log", async (c) => c.json({ log: await aiLog({ log }, c.get("account").id) }));
  routes.get("/ai/drafts", async (c) =>
    c.json({ drafts: await aiDrafts(deps, c.get("account").id, clock()) }),
  );
  routes.post("/ai/drafts/:id/adopt", async (c) =>
    write(c, writes, aiAdoptDraft(deps, clock), {
      input: { ...(await body(c)), id: c.req.param("id") },
    }),
  );
  routes.post("/ai/drafts/:id/discard", async (c) =>
    write(c, writes, aiDiscardDraft(deps, clock), { input: { id: c.req.param("id") } }),
  );
  return routes;
}
