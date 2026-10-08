import {
  difficultyOverview,
  specimenHints,
  zoneDistribution,
  lightOverview,
} from "@pflanzendex/core";
import {
  CareProfilePostgres,
  LocationPostgres,
  SpeciesPostgres,
  SpecimenPostgres,
  ZonePostgres,
} from "@pflanzendex/db";
import { Hono } from "hono";
import type { Pool } from "pg";
import type { AuthEnv } from "../../kernel";

/**
 * Derived views over the specimens (read only, nothing stored, P-01): the light distribution (US-LIC-02), the hints
 * about incomplete specimens (US-BES-08) and the difficulty overview (US-BES-05). Only data of the own account flows in (P-04). Mounted before
 * `/specimens/:id`, otherwise "distribution" and "hints" would be read as an ID.
 */
export function derivedRoutes(pool: Pool): Hono<AuthEnv> {
  const deps = {
    specimens: new SpecimenPostgres(pool),
    species: new SpeciesPostgres(pool),
    locations: new LocationPostgres(pool),
    zones: new ZonePostgres(pool),
    profiles: new CareProfilePostgres(pool),
  };
  const routes = new Hono<AuthEnv>();
  routes.get("/specimens/distribution", async (c) =>
    c.json({ distribution: await zoneDistribution(deps, c.get("account").id) }),
  );
  routes.get("/specimens/light-overview", async (c) =>
    c.json(await lightOverview(deps, c.get("account").id)),
  );
  routes.get("/specimens/difficulty", async (c) =>
    c.json(await difficultyOverview(deps, c.get("account").id)),
  );
  routes.get("/specimens/hints", async (c) =>
    c.json({ hints: await specimenHints(deps, c.get("account").id) }),
  );
  return routes;
}
