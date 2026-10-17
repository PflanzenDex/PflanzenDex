import { specimenSetLightZone, specimenSetLocation, type ZoneUsage } from "@pflanzendex/core";
import { SpecimenPostgres, IdempotencyPostgres } from "@pflanzendex/db";
import { Hono } from "hono";
import type { Pool } from "pg";
import { body, write, type AuthEnv } from "../../kernel";

/**
 * Set the location of a specimen to one of the own locations (US-PHA-03, the action behind the BES-08 hint "location
 * missing"). Writing goes only through `specimen.set_location` (P-03, with `Idempotency-Key`); a foreign or unknown
 * specimen looks the same: 404, a location of another account is `location.not_found` (P-04). The own light zone of a
 * specimen (US-LIC-02, US-BES-04) is set or cleared through `specimen.set_light_zone` the same way; a zone of another
 * account is `light_zone.not_found`.
 */
export function locationRoutes(pool: Pool): Hono<AuthEnv> {
  const setLocation = specimenSetLocation({ specimens: new SpecimenPostgres(pool) });
  const setLightZone = specimenSetLightZone({ specimens: new SpecimenPostgres(pool) });
  const deps = { idempotency: new IdempotencyPostgres(pool) };
  const routes = new Hono<AuthEnv>();
  routes.post("/specimens/:id/location", async (c) =>
    write(c, deps, setLocation, {
      input: { ...(await body(c)), specimenId: c.req.param("id") },
    }),
  );
  routes.post("/specimens/:id/light-zone", async (c) =>
    write(c, deps, setLightZone, {
      input: { ...(await body(c)), specimenId: c.req.param("id") },
    }),
  );
  return routes;
}

/** The zone usage of the specimens for `lightRoutes`: a zone that a specimen carries is not deleted unnoticed (US-LIC-05). */
export function specimenZoneUsageFor(pool: Pool): ZoneUsage {
  const specimens = new SpecimenPostgres(pool);
  return { user: (userId, lightZoneId) => specimens.zoneUsers(userId, lightZoneId) };
}
