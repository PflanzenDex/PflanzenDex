import { appError, isTimeZone, pokedexMarkSeen, pokedexOwnership } from "@pflanzendex/core";
import {
  IdempotencyPostgres,
  PokedexStatePostgres,
  SpeciesPostgres,
  SpecimenPostgres,
} from "@pflanzendex/db";
import { Hono } from "hono";
import type { Pool } from "pg";
import { body, errorBody, write, type AuthEnv } from "../kernel";

export const POKEDEX_PATHS = ["/pokedex"] as const;

/**
 * Ownership of species derived from the specimens (US-POK-06) with the catch date (US-POK-07): read only, nothing
 * stored (P-01). Only data of the own account flows in (P-04). `timeZone` (IANA name, the profile zone with the device
 * zone as fallback, chosen by the client, US-ACC-02) decides the local date of a creation moment (NFR-08).
 * The seen state (US-POK-12) is the only thing stored: `GET /pokedex/seen` answers `{ seen }` (`null` before the first
 * visit), `POST /pokedex/seen` marks species as seen and runs through `pokedex.mark_seen` (P-03, with `Idempotency-Key`);
 * "new" is derived by the client as caught minus seen. Both only touch the own account (P-04).
 */
export function pokedexRoutes(pool: Pool): Hono<AuthEnv> {
  const deps = { specimens: new SpecimenPostgres(pool), species: new SpeciesPostgres(pool) };
  const states = new PokedexStatePostgres(pool);
  const markSeen = pokedexMarkSeen({ seen: states, ownership: deps });
  const writeDeps = { idempotency: new IdempotencyPostgres(pool) };
  const routes = new Hono<AuthEnv>();
  routes.get("/pokedex/ownership", async (c) => {
    const timeZone = c.req.query("timeZone");
    if (!isTimeZone(timeZone)) {
      const details = [{ field: "timeZone", code: "input.invalid" as const }];
      return c.json(errorBody(appError("input.invalid", { details })), 400);
    }
    return c.json({ ownership: await pokedexOwnership(deps, c.get("account").id, timeZone) });
  });
  routes.get("/pokedex/seen", async (c) =>
    c.json({ seen: await states.find(c.get("account").id) }),
  );
  routes.post("/pokedex/seen", async (c) =>
    write(c, writeDeps, markSeen, { input: await body(c) }),
  );
  return routes;
}
