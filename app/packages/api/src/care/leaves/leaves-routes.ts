import {
  LEAF_KEEPER_SWITCH,
  appError,
  keeperOffOf,
  leafLogView,
  leafRecord,
  leafRemove,
} from "@pflanzendex/core";
import {
  IdempotencyPostgres,
  KeeperSwitchPostgres,
  LeavesPostgres,
  SpecimenPostgres,
} from "@pflanzendex/db";
import { Hono } from "hono";
import type { Pool } from "pg";
import { errorBody, body, write, type AuthEnv } from "../../kernel";
import type { CareOptions } from "../care-routes";

/**
 * The leaf log of a plant (US-WAC-07): the list with its count and comparison, one tap or a detailed leaf, and the removal
 * of a leaf logged by mistake. Writes go only through `leaf.record` and `leaf.remove` (P-03, `Idempotency-Key`). While the
 * keeper switch is off the list is empty and writes are refused with `onboarding.keeper_off`; the rows stay (P-12, P-10).
 * A foreign or unknown plant answers 404 (P-04).
 */
export function leafRoutes(pool: Pool, opt: CareOptions = {}): Hono<AuthEnv> {
  const specimens = new SpecimenPostgres(pool);
  const leaves = new LeavesPostgres(pool);
  const switches = new KeeperSwitchPostgres(pool);
  const keeperOff = async (userId: string) =>
    keeperOffOf(await switches.list(userId)).has(LEAF_KEEPER_SWITCH);
  const deps = { idempotency: new IdempotencyPostgres(pool) };
  const record = leafRecord({
    leaves,
    specimens,
    keeperOff,
    clock: opt.clock ?? (() => new Date()),
  });
  const remove = leafRemove({ leaves, keeperOff });
  const routes = new Hono<AuthEnv>();

  routes.get("/specimens/:id/leaves", async (c) => {
    const view = await leafLogView(
      { leaves, specimens, keeperOff },
      c.get("account").id,
      c.req.param("id"),
    );
    return view ? c.json(view) : c.json(errorBody(appError("specimen.not_found")), 404);
  });
  routes.post("/specimens/:id/leaves", async (c) =>
    write(c, deps, record, {
      input: { ...(await body(c)), specimenId: c.req.param("id") },
      success: 201,
    }),
  );
  routes.delete("/specimens/:id/leaves/:leafId", async (c) =>
    write(c, deps, remove, {
      input: { specimenId: c.req.param("id"), leafId: c.req.param("leafId") },
    }),
  );
  return routes;
}
