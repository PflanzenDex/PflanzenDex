import { equipmentAssignSensor, sensorAssignments } from "@pflanzendex/core";
import {
  EquipmentPostgres,
  LocationPostgres,
  SpecimenPostgres,
  type IdempotencyPostgres,
} from "@pflanzendex/db";
import type { Hono } from "hono";
import type { Pool } from "pg";
import { body, write, type AuthEnv } from "../../kernel";

/**
 * Sensors and their place (US-EQU-06). Reading lists the sensors with the specimen or location each sits at, plus the
 * choices, derived on every request (P-01); no sensor values (FR-MON-07). Writing goes only through the validating
 * operation `equipment.assign_sensor` (P-03, with `Idempotency-Key`). Private to the account (P-04, P-05).
 */
export function addSensorRoutes(
  routes: Hono<AuthEnv>,
  pool: Pool,
  deps: { idempotency: IdempotencyPostgres },
): void {
  const equipment = new EquipmentPostgres(pool);
  const assign = equipmentAssignSensor({ equipment });
  routes.get("/equipment/sensors", async (c) =>
    c.json(
      await sensorAssignments(
        { equipment, specimens: new SpecimenPostgres(pool), locations: new LocationPostgres(pool) },
        c.get("account").id,
      ),
    ),
  );
  routes.post("/equipment/:id/sensor-target", async (c) =>
    write(c, deps, assign, { input: { ...(await body(c)), id: c.req.param("id") } }),
  );
}
