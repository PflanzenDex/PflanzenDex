import { pokedexOwnership } from "@pflanzendex/core";
import { SpeciesPostgres, SpecimenPostgres } from "@pflanzendex/db";
import { Hono } from "hono";
import type { Pool } from "pg";
import type { AuthEnv } from "../kernel";

export const POKEDEX_PATHS = ["/pokedex"] as const;

/**
 * Ownership of species derived from the specimens (US-POK-06): read only, nothing stored (P-01). Only data of the own
 * account flows in (P-04).
 */
export function pokedexRoutes(pool: Pool): Hono<AuthEnv> {
  const deps = { specimens: new SpecimenPostgres(pool), species: new SpeciesPostgres(pool) };
  const routes = new Hono<AuthEnv>();
  routes.get("/pokedex/ownership", async (c) =>
    c.json({ ownership: await pokedexOwnership(deps, c.get("account").id) }),
  );
  return routes;
}
