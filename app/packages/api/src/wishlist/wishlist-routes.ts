import {
  wishBought,
  wishBuy,
  wishCandidates,
  wishCreate,
  wishDiscard,
  wishDiscarded,
  wishLinkSpecimen,
  wishRemove,
  wishRename,
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
 * Duplicate names that migration 0020 left exempt (FR-WUN-06, #303) are part of the candidate list (`duplicates`) and are
 * repaired through `wish.rename` and `wish.remove_duplicate`, which work only on wishes without a name key.
 * "Bought" (US-WUN-03) goes through `wish.buy`; the bought wishes stay readable as the history (`GET /wishes/bought`).
 * The path to the plant (US-WUN-05): `wish.link_specimen` links a bought wish to the specimen it became, `wish.discard`
 * sets an open wish to discarded; discarded wishes stay readable (`GET /wishes/discarded`, P-10).
 */
export function wishRoutes(pool: Pool, zoneStock: ZoneStockSource): Hono<AuthEnv> {
  const wishes = new WishesPostgres(pool);
  const create = wishCreate({ wishes });
  const buy = wishBuy({ wishes });
  const discard = wishDiscard({ wishes });
  const link = wishLinkSpecimen({ wishes });
  const rename = wishRename({ wishes });
  const removeDuplicate = wishRemove({ wishes });
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
  routes.get("/wishes/discarded", async (c) =>
    c.json(await wishDiscarded({ wishes }, c.get("account").id)),
  );
  routes.post("/wishes/:id/discard", async (c) =>
    write(c, deps, discard, { input: { wishId: c.req.param("id") } }),
  );
  routes.post("/wishes/:id/specimen", async (c) =>
    write(c, deps, link, { input: { ...(await body(c)), wishId: c.req.param("id") } }),
  );
  routes.post("/wishes/:id/rename", async (c) =>
    write(c, deps, rename, { input: { ...(await body(c)), wishId: c.req.param("id") } }),
  );
  routes.post("/wishes/:id/remove-duplicate", async (c) =>
    write(c, deps, removeDuplicate, { input: { wishId: c.req.param("id") } }),
  );
  return routes;
}
