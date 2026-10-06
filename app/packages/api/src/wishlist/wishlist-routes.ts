import {
  wishBought,
  wishBuy,
  wishCandidates,
  wishCreate,
  wishZoneUsage,
  type WishRow,
  type ZoneStockSource,
  type ZoneUsage,
} from "@pflanzendex/core";
import { IdempotencyPostgres, WishesPostgres } from "@pflanzendex/db";
import { Hono } from "hono";
import type { Pool } from "pg";
import { body, write, type AuthEnv } from "../kernel";

/** Paths the sign-in guard (bearer token) must cover. */
export const WISH_PATHS = ["/wishes"] as const;

/** The zone usage of the wishes for `lightRoutes`: a zone a wish points to is not deleted unnoticed (US-LIC-05). */
export function wishZoneUsageFor(pool: Pool): ZoneUsage {
  return wishZoneUsage({ wishes: new WishesPostgres(pool) });
}

/**
 * The wishlist (US-WUN-01, DM-WUN-01). Reading is a derived view: the open candidates sorted by the stock of their
 * target zone (nothing stored twice, P-01). The stock comes through the port `ZoneStockSource`, which the app root
 * wires (ADR 0003: the wishlist never reaches into the collection). Writing goes only through `wish.create` (P-03,
 * with `Idempotency-Key`). Everything is private to the account (P-04, P-05): a foreign zone looks like an unknown one.
 * "Bought" (US-WUN-03) goes through `wish.buy`; the bought wishes stay readable as the history (`GET /wishes/bought`).
 */
export function wishRoutes(pool: Pool, zoneStock: ZoneStockSource): Hono<AuthEnv> {
  const wishes = new WishesPostgres(pool);
  const create = wishCreate({ wishes });
  const buy = wishBuy({ wishes });
  const deps = { idempotency: new IdempotencyPostgres(pool) };
  const routes = new Hono<AuthEnv>();
  routes.get("/wishes/candidates", async (c) =>
    c.json(await wishCandidates({ wishes, stock: zoneStock }, c.get("account").id)),
  );
  routes.post("/wishes", async (c) =>
    write(c, deps, create, {
      input: await body(c),
      success: 201,
      wrapper: (wish: WishRow) => ({ wish }),
    }),
  );
  routes.get("/wishes/bought", async (c) =>
    c.json(await wishBought({ wishes }, c.get("account").id)),
  );
  routes.post("/wishes/:id/buy", async (c) =>
    write(c, deps, buy, { input: { wishId: c.req.param("id") } }),
  );
  return routes;
}
