import { equipmentRecord, type EquipmentRow } from "@pflanzendex/core";
import { EquipmentPostgres, IdempotencyPostgres } from "@pflanzendex/db";
import { Hono } from "hono";
import type { Pool } from "pg";
import { body, write, type AuthEnv } from "../kernel";

/** Paths the sign-in guard (bearer token) must cover. */
export const EQUIPMENT_PATHS = ["/equipment"] as const;

/**
 * Equipment (US-EQU-01, DM-EQU-01). Reading lists the equipment of the account; writing goes only through
 * `equipment.record` (P-03, with `Idempotency-Key`). Everything is private to the account (P-04, P-05) and works
 * without any partner integration (FR-EQU-01).
 */
export function equipmentRoutes(pool: Pool): Hono<AuthEnv> {
  const equipment = new EquipmentPostgres(pool);
  const record = equipmentRecord({ equipment });
  const deps = { idempotency: new IdempotencyPostgres(pool) };
  const routes = new Hono<AuthEnv>();
  routes.get("/equipment", async (c) =>
    c.json({ equipment: await equipment.list(c.get("account").id) }),
  );
  routes.post("/equipment", async (c) =>
    write(c, deps, record, {
      input: await body(c),
      success: 201,
      wrapper: (item: EquipmentRow) => ({ equipment: item }),
    }),
  );
  return routes;
}
