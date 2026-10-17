import {
  equipmentWishBuy,
  equipmentWishCreate,
  equipmentWishDiscard,
  equipmentWishes,
  type EquipmentWishRow,
} from "@pflanzendex/core";
import { EquipmentWishesPostgres, type IdempotencyPostgres } from "@pflanzendex/db";
import type { Hono } from "hono";
import type { Pool } from "pg";
import { body, write, type AuthEnv } from "../../kernel";

/**
 * Equipment wishes (US-EQU-08): wishes of type equipment next to the plant wishes. Reading lists them by status;
 * writing goes only through `equipment_wish.create`, `.buy` and `.discard` (P-03, with `Idempotency-Key`). "Bought"
 * answers with the prefill for the equipment form (US-EQU-01). They never reach the plant candidates, the buffer or the
 * zone hints of `/wishes` (separate count, US-WUN-02). Private to the account (P-04, P-05).
 */
export function addWishRoutes(
  routes: Hono<AuthEnv>,
  pool: Pool,
  deps: { idempotency: IdempotencyPostgres },
): void {
  const wishes = new EquipmentWishesPostgres(pool);
  const create = equipmentWishCreate({ wishes });
  const buy = equipmentWishBuy({ wishes });
  const discard = equipmentWishDiscard({ wishes });
  routes.get("/equipment/wishes", async (c) =>
    c.json(await equipmentWishes({ wishes }, c.get("account").id)),
  );
  routes.post("/equipment/wishes", async (c) =>
    write(c, deps, create, {
      input: await body(c),
      success: 201,
      wrapper: (wish: EquipmentWishRow) => ({ wish }),
    }),
  );
  routes.post("/equipment/wishes/:id/buy", async (c) =>
    write(c, deps, buy, { input: { wishId: c.req.param("id") } }),
  );
  routes.post("/equipment/wishes/:id/discard", async (c) =>
    write(c, deps, discard, { input: { wishId: c.req.param("id") } }),
  );
}
