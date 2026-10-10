import { isTimeZone, monitoringWater, appError, type WateredDependencies } from "@pflanzendex/core";
import { IdempotencyPostgres, SpecimenPostgres, WateringPostgres } from "@pflanzendex/db";
import { Hono } from "hono";
import type { Pool } from "pg";
import { body, errorBody, statusFor, write, type AuthEnv } from "../kernel";
import { wateringDueFor } from "./watering";

/**
 * Watering without a sensor (US-MON-05), always for the own account (P-04, P-05): `GET /watering/due?timeZone=` lists
 * the plants that are due today (derived on every request, nothing stored, P-01); `POST /watering` logs "watered" for
 * one or several specimens (P-03, `Idempotency-Key`). The guard is applied by the app.
 */
export function wateringRoutes(pool: Pool, clock: () => Date): Hono<AuthEnv> {
  const deps: WateredDependencies = {
    specimens: new SpecimenPostgres(pool),
    watering: new WateringPostgres(pool),
    clock,
  };
  const water = monitoringWater(deps);
  const writes = { idempotency: new IdempotencyPostgres(pool) };
  const routes = new Hono<AuthEnv>();
  routes.get("/watering/due", async (c) => {
    const zone = c.req.query("timeZone");
    if (!isTimeZone(zone)) {
      const e = appError("input.invalid", {
        details: [{ field: "timeZone", code: "input.invalid" }],
      });
      return c.json(errorBody(e), statusFor(e));
    }
    return c.json({ due: await wateringDueFor(pool, c.get("account").id, zone, clock()) });
  });
  routes.post("/watering", async (c) => write(c, writes, water, { input: await body(c) }));
  return routes;
}
