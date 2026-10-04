import { appError, isTimeZone, pokedexOwnership } from "@pflanzendex/core";
import { SpeciesPostgres, SpecimenPostgres } from "@pflanzendex/db";
import { Hono } from "hono";
import type { Pool } from "pg";
import { errorBody, type AuthEnv } from "../kernel";

export const POKEDEX_PATHS = ["/pokedex"] as const;

/**
 * Ownership of species derived from the specimens (US-POK-06) with the catch date (US-POK-07): read only, nothing
 * stored (P-01). Only data of the own account flows in (P-04). `timeZone` (IANA name, from the device for now, until
 * the profile has one, US-ACC-02) decides the local date of a creation moment (NFR-08).
 */
export function pokedexRoutes(pool: Pool): Hono<AuthEnv> {
  const deps = { specimens: new SpecimenPostgres(pool), species: new SpeciesPostgres(pool) };
  const routes = new Hono<AuthEnv>();
  routes.get("/pokedex/ownership", async (c) => {
    const timeZone = c.req.query("timeZone");
    if (!isTimeZone(timeZone)) {
      const details = [{ field: "timeZone", code: "input.invalid" as const }];
      return c.json(errorBody(appError("input.invalid", { details })), 400);
    }
    return c.json({ ownership: await pokedexOwnership(deps, c.get("account").id, timeZone) });
  });
  return routes;
}
