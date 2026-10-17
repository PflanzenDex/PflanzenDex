import { speciesLoad, speciesSearch, speciesPropose, appError } from "@pflanzendex/core";
import { SpeciesPostgres, IdempotencyPostgres } from "@pflanzendex/db";
import { Hono } from "hono";
import type { Pool } from "pg";
import { errorBody, body, write, type AuthEnv } from "../kernel";

/** Paths the sign-in guard (bearer token) must cover. */
export const SPECIES_PATHS = ["/species"] as const;

/**
 * Species catalog (US-BES-01). Reading returns what the account may see: approved species and its own
 * proposals (FR-BES-11). Writing goes only through `species.propose` (review status `proposal`, P-03).
 * A foreign or unknown species looks the same: 404.
 */
export function speciesRoutes(pool: Pool): Hono<AuthEnv> {
  const species = new SpeciesPostgres(pool);
  const deps = { idempotency: new IdempotencyPostgres(pool) };
  const routes = new Hono<AuthEnv>();

  routes.get("/species", async (c) =>
    c.json({ species: await speciesSearch(species, c.get("account").id, c.req.query("q") ?? "") }),
  );
  routes.get("/species/:id", async (c) => {
    const found = await speciesLoad(species, c.get("account").id, c.req.param("id"));
    return found ? c.json(found) : c.json(errorBody(appError("species.not_found")), 404);
  });
  routes.post("/species", async (c) =>
    write(c, deps, speciesPropose(species), { input: await body(c), success: 201 }),
  );
  return routes;
}
