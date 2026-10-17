import {
  equipmentDescribeLamp,
  equipmentMeasure,
  equipmentSetDeviationLimit,
  lampLight,
  type LampMeasurement,
} from "@pflanzendex/core";
import {
  DeviationLimitPostgres,
  EquipmentPostgres,
  LampMeasurementsPostgres,
  ZonePostgres,
  type IdempotencyPostgres,
} from "@pflanzendex/db";
import type { Hono } from "hono";
import type { Pool } from "pg";
import { body, write, type AuthEnv } from "../../kernel";

/**
 * The measured light intensity per lamp (US-EQU-03, FR-LIC-06). Reading is derived on every request from the lamps, the
 * zones, the measurement log and the keeper's limit (P-01); writing goes only through the validating operations
 * `equipment.measure`, `equipment.describe_lamp` and `equipment.set_deviation_limit` (P-03, with `Idempotency-Key`).
 */
export function addLampRoutes(
  routes: Hono<AuthEnv>,
  pool: Pool,
  deps: { idempotency: IdempotencyPostgres },
): void {
  const equipment = new EquipmentPostgres(pool);
  const measurements = new LampMeasurementsPostgres(pool);
  const limits = new DeviationLimitPostgres(pool);
  const measure = equipmentMeasure({ measurements });
  const describe = equipmentDescribeLamp({ equipment });
  const setLimit = equipmentSetDeviationLimit({ limits });
  routes.get("/equipment/lamps", async (c) =>
    c.json(
      await lampLight(
        { equipment, zones: new ZonePostgres(pool), measurements, limits },
        c.get("account").id,
      ),
    ),
  );
  routes.post("/equipment/lamps/limit", async (c) =>
    write(c, deps, setLimit, { input: await body(c) }),
  );
  routes.post("/equipment/:id/measurements", async (c) =>
    write(c, deps, measure, {
      input: { ...(await body(c)), equipmentId: c.req.param("id") },
      success: 201,
      wrapper: (measurement: LampMeasurement) => ({ measurement }),
    }),
  );
  routes.post("/equipment/:id/lamp-data", async (c) =>
    write(c, deps, describe, { input: { ...(await body(c)), id: c.req.param("id") } }),
  );
}
