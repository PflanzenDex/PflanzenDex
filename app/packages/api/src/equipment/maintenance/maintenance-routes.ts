import {
  appError,
  equipmentChecksDue,
  equipmentMarkChecked,
  equipmentSetMaintenance,
  isTimeZone,
  localToday,
} from "@pflanzendex/core";
import {
  EquipmentPostgres,
  LampMeasurementsPostgres,
  type IdempotencyPostgres,
} from "@pflanzendex/db";
import type { Hono } from "hono";
import type { Pool } from "pg";
import { body, errorBody, statusFor, write, type AuthEnv } from "../../kernel";

/**
 * Operation and maintenance of a device (US-EQU-04). Reading lists the checks that are due, derived on every request
 * (P-01) with the same rule as the "Today" list and the reminders; `timeZone` (IANA name) decides what "today" is
 * (NFR-08). Writing goes only through the validating operations `equipment.set_maintenance` and
 * `equipment.mark_checked` (P-03, with `Idempotency-Key`).
 */
export function addMaintenanceRoutes(
  routes: Hono<AuthEnv>,
  pool: Pool,
  deps: { idempotency: IdempotencyPostgres },
): void {
  const equipment = new EquipmentPostgres(pool);
  const setMaintenance = equipmentSetMaintenance({ equipment });
  const markChecked = equipmentMarkChecked({ equipment });
  routes.get("/equipment/checks-due", async (c) => {
    const zone = c.req.query("timeZone");
    if (!isTimeZone(zone)) {
      const error = appError("input.invalid", {
        details: [{ field: "timeZone", code: "input.invalid" }],
      });
      return c.json(errorBody(error), statusFor(error));
    }
    const due = await equipmentChecksDue(
      { equipment, measurements: new LampMeasurementsPostgres(pool) },
      c.get("account").id,
      localToday(new Date(), zone),
    );
    return c.json({ due });
  });
  routes.post("/equipment/:id/maintenance", async (c) =>
    write(c, deps, setMaintenance, { input: { ...(await body(c)), id: c.req.param("id") } }),
  );
  routes.post("/equipment/:id/checked", async (c) =>
    write(c, deps, markChecked, { input: { ...(await body(c)), id: c.req.param("id") } }),
  );
}
