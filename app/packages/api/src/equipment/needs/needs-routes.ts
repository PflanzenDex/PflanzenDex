import {
  equipmentNeeds,
  equipmentRecommendations,
  type ProductEntry,
  type ZoneStockSource,
} from "@pflanzendex/core";
import type { EquipmentPostgres } from "@pflanzendex/db";
import { WishesPostgres, ZonePostgres } from "@pflanzendex/db";
import type { Hono } from "hono";
import type { Pool } from "pg";
import type { AuthEnv } from "../../kernel";

/**
 * What is missing (US-EQU-07) and the suggestions for it (US-EQU-10), both derived on every request. The catalog comes
 * from the operator; without one nothing is recommended (FR-EQU-09).
 */
export function addNeedRoutes(
  routes: Hono<AuthEnv>,
  ports: {
    equipment: EquipmentPostgres;
    pool: Pool;
    zoneStock: ZoneStockSource;
    products: readonly ProductEntry[];
  },
): void {
  const needsOf = (userId: string) =>
    equipmentNeeds(
      {
        equipment: ports.equipment,
        zones: new ZonePostgres(ports.pool),
        stock: ports.zoneStock,
        wishes: new WishesPostgres(ports.pool),
      },
      userId,
    );
  routes.get("/equipment/needs", async (c) =>
    c.json({ needs: await needsOf(c.get("account").id) }),
  );
  routes.get("/equipment/recommendations", async (c) =>
    c.json({
      recommendations: equipmentRecommendations(await needsOf(c.get("account").id), ports.products),
    }),
  );
}
