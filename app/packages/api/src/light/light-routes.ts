import {
  lightZoneUpdate,
  lightZoneCreate,
  lightZoneDelete,
  lightZoneDefault,
  locationUpdate,
  locationSetUp,
  locationHints,
  type Operation,
  type ZoneUsage,
} from "@pflanzendex/core";
import { IdempotencyPostgres, LocationPostgres, ZonePostgres } from "@pflanzendex/db";
import { Hono } from "hono";
import type { Pool } from "pg";
import { body, write as writeWith, type ResponseShape, type AuthEnv, type Ctx } from "../kernel";

/** Paths the sign-in guard (bearer token) must cover. */
export const LIGHT_PATHS = ["/light-zones", "/locations", "/hints"] as const;

/**
 * Locations and light zones (US-LIC-05). Writes go only through the operations of `core`
 * (validation, repeat guard via `Idempotency-Key`), reads through the adapters under `withAccount`.
 *
 * Boundary: species and specimens (BES-02) link no zone, so they need no source: a specimen reaches a zone
 * only through its location, which the location source already reports. Whoever first lets a field point to a zone
 * (zone override of cuttings BES-04, care profile BES-09) supplies its source via `additionalUsage`.
 */
export function lightRoutes(pool: Pool, additionalUsage: readonly ZoneUsage[] = []): Hono<AuthEnv> {
  const zones = new ZonePostgres(pool);
  const locations = new LocationPostgres(pool);
  const deps = { idempotency: new IdempotencyPostgres(pool) };
  const routes = new Hono<AuthEnv>();

  const write = <E, A>(
    c: Ctx,
    op: Operation<E, A>,
    input: unknown,
    form: Omit<ResponseShape<A>, "input"> = {},
  ) => writeWith(c, deps, op, { ...form, input });
  const withId = async (c: Ctx) => ({ ...(await body(c)), id: c.req.param("id") });

  routes.get("/light-zones", async (c) => c.json({ zones: await zones.list(c.get("account").id) }));
  routes.post("/light-zones/defaults", async (c) =>
    write(
      c,
      lightZoneDefault(zones),
      {},
      {
        success: 201,
        wrapper: (zoneList) => ({ zones: zoneList }),
      },
    ),
  );
  routes.post("/light-zones", async (c) =>
    write(c, lightZoneCreate(zones), await body(c), { success: 201 }),
  );
  routes.put("/light-zones/:id", async (c) => write(c, lightZoneUpdate(zones), await withId(c)));
  routes.delete("/light-zones/:id", async (c) =>
    write(c, lightZoneDelete(zones, [locations, ...additionalUsage]), {
      id: c.req.param("id"),
    }),
  );

  routes.get("/locations", async (c) =>
    c.json({ locations: await locations.list(c.get("account").id) }),
  );
  routes.post("/locations", async (c) =>
    write(c, locationSetUp(locations), await body(c), { success: 201 }),
  );
  routes.put("/locations/:id", async (c) => write(c, locationUpdate(locations), await withId(c)));

  // Hints (US-BES-08): the central hints page follows with BES-08; here LIC-05 supplies its hints.
  routes.get("/hints", async (c) =>
    c.json({ hints: locationHints(await locations.list(c.get("account").id)) }),
  );
  return routes;
}
