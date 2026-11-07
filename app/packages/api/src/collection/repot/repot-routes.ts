import {
  REPOT_PLANNER_KEEPER_SWITCH,
  appError,
  keeperOffOf,
  specimenTickRepotSign,
  specimenUntickRepotSign,
} from "@pflanzendex/core";
import { IdempotencyPostgres, KeeperSwitchPostgres, RepotPostgres } from "@pflanzendex/db";
import { Hono } from "hono";
import type { Pool } from "pg";
import { body, errorBody, statusFor, write, type AuthEnv } from "../../kernel";

/**
 * Repot observations (US-BES-19): `POST /specimens/:id/repot-signs` ticks (`ticked: true`) or clears (`ticked: false`) one
 * of the three observations of a plant (P-03, `Idempotency-Key`). Refused with `onboarding.keeper_off` while the keeper
 * switch "repot_planner" is off; the observations stay (P-12). A foreign or unknown plant answers 404 (P-04). The sign-in
 * guard of the collection covers the path.
 */
export function repotSignRoutes(pool: Pool, clock: () => Date): Hono<AuthEnv> {
  const switches = new KeeperSwitchPostgres(pool);
  const deps = {
    repots: new RepotPostgres(pool),
    keeperOff: async (userId: string) =>
      keeperOffOf(await switches.list(userId)).has(REPOT_PLANNER_KEEPER_SWITCH),
    clock,
  };
  const tick = specimenTickRepotSign(deps);
  const untick = specimenUntickRepotSign(deps);
  const writes = { idempotency: new IdempotencyPostgres(pool) };
  const routes = new Hono<AuthEnv>();
  routes.post("/specimens/:id/repot-signs", async (c) => {
    const { ticked, ...rest } = await body(c);
    if (typeof ticked !== "boolean") {
      const failure = appError("input.invalid", {
        details: [{ field: "ticked", code: "input.invalid" }],
      });
      return c.json(errorBody(failure), statusFor(failure));
    }
    return write(c, writes, ticked ? tick : untick, {
      input: { ...rest, specimenId: c.req.param("id") },
    });
  });
  return routes;
}
