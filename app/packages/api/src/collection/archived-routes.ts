import { specimenArchived, specimenArchive, specimenRestore } from "@pflanzendex/core";
import { SpeciesPostgres, SpecimenPostgres, IdempotencyPostgres } from "@pflanzendex/db";
import { Hono } from "hono";
import type { Pool } from "pg";
import { body, write, type AuthEnv } from "../kernel";

/**
 * Archive and restore (US-BES-07). Writes only through the operations (P-03, `Idempotency-Key`); the archive returns
 * only specimens of the own account (P-04). Mounted before `/specimens/:id`, otherwise "archived" would be read as an
 * ID.
 */
export function archivedRoutes(pool: Pool, clock: () => Date): Hono<AuthEnv> {
  const specimens = new SpecimenPostgres(pool);
  const species = new SpeciesPostgres(pool);
  const deps = { idempotency: new IdempotencyPostgres(pool) };
  const archive = specimenArchive({ specimens, clock });
  const restore = specimenRestore({ specimens });
  const routes = new Hono<AuthEnv>();

  routes.get("/specimens/archived", async (c) =>
    c.json({ archived: await specimenArchived({ specimens, species }, c.get("account").id) }),
  );
  routes.post("/specimens/:id/archive", async (c) =>
    write(c, deps, archive, {
      input: { ...(await body(c)), specimenId: c.req.param("id") },
    }),
  );
  routes.post("/specimens/:id/restore", async (c) =>
    write(c, deps, restore, { input: { specimenId: c.req.param("id") } }),
  );
  return routes;
}
