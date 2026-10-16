import {
  equipmentNeeds,
  equipmentRecord,
  equipmentSetStatus,
  equipmentSetZone,
  equipmentZoneUsage,
  zoneEquipment,
  type EquipmentRow,
  type ZoneStockSource,
  type ZoneUsage,
} from "@pflanzendex/core";
import {
  EquipmentPostgres,
  IdempotencyPostgres,
  WishesPostgres,
  ZonePostgres,
} from "@pflanzendex/db";
import { Hono } from "hono";
import type { Pool } from "pg";
import { body, write, type AuthEnv, type FeatureAccess } from "../kernel";
import { addLampRoutes } from "./lamps";
import { addMaintenanceRoutes } from "./maintenance";
import { addSensorRoutes } from "./sensors";
import { addSharingRoutes, gateSharingRoutes } from "./sharing";
import { friendEquipmentPorts } from "./sharing/ports";
import { addSupplyRoutes } from "./supply";
import { addWishRoutes } from "./wishes";

/** Paths the sign-in guard (bearer token) must cover. */
export const EQUIPMENT_PATHS = ["/equipment"] as const;

/** The zone usage of the lamps for `lightRoutes`: a zone with a lamp is not deleted unnoticed (US-EQU-02, P-10). */
export function equipmentZoneUsageFor(pool: Pool): ZoneUsage {
  return equipmentZoneUsage({ equipment: new EquipmentPostgres(pool) });
}

/**
 * Equipment (US-EQU-01, DM-EQU-01). Reading lists the equipment of the account; writing goes only through
 * `equipment.record` (P-03, with `Idempotency-Key`). Everything is private to the account (P-04, P-05) and works
 * without any partner integration (FR-EQU-01). The devices per light zone (US-EQU-02) are derived on every request from
 * the lamps, the zones and the stock per zone, which the app root supplies through the port `ZoneStockSource`.
 */
export function equipmentRoutes(
  pool: Pool,
  zoneStock: ZoneStockSource,
  features?: FeatureAccess,
): Hono<AuthEnv> {
  const equipment = new EquipmentPostgres(pool);
  const record = equipmentRecord({ equipment });
  const setZone = equipmentSetZone({ equipment });
  const setStatus = equipmentSetStatus({ equipment });
  const deps = { idempotency: new IdempotencyPostgres(pool) };
  const routes = new Hono<AuthEnv>();
  routes.get("/equipment", async (c) =>
    c.json({ equipment: await equipment.list(c.get("account").id) }),
  );
  routes.get("/equipment/zones", async (c) =>
    c.json(
      await zoneEquipment(
        { equipment, zones: new ZonePostgres(pool), stock: zoneStock },
        c.get("account").id,
      ),
    ),
  );
  routes.get("/equipment/needs", async (c) =>
    c.json({
      needs: await equipmentNeeds(
        {
          equipment,
          zones: new ZonePostgres(pool),
          stock: zoneStock,
          wishes: new WishesPostgres(pool),
        },
        c.get("account").id,
      ),
    }),
  );
  routes.post("/equipment/:id/zone", async (c) =>
    write(c, deps, setZone, { input: { ...(await body(c)), id: c.req.param("id") } }),
  );
  routes.post("/equipment/:id/status", async (c) =>
    write(c, deps, setStatus, { input: { ...(await body(c)), id: c.req.param("id") } }),
  );
  routes.post("/equipment", async (c) =>
    write(c, deps, record, {
      input: await body(c),
      success: 201,
      wrapper: (item: EquipmentRow) => ({ equipment: item }),
    }),
  );
  addLampRoutes(routes, pool, deps);
  addMaintenanceRoutes(routes, pool, deps);
  addSupplyRoutes(routes, pool, deps);
  addSensorRoutes(routes, pool, deps);
  addWishRoutes(routes, pool, deps);
  if (features) gateSharingRoutes(routes, features);
  addSharingRoutes(routes, pool, deps, friendEquipmentPorts(pool));
  return routes;
}
