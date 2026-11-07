import { fertilizingOf, monitoringFertilize, type FertilizedDependencies } from "@pflanzendex/core";
import { FertilizingPostgres, IdempotencyPostgres, SpecimenPostgres } from "@pflanzendex/db";
import { Hono } from "hono";
import type { Pool } from "pg";
import { body, errorBody, statusFor, write, type AuthEnv } from "../kernel";

/**
 * Fertilizing (US-MON-09), always for the own account (P-04, P-05): `POST /fertilizing` logs "Gedüngt" for one plant on
 * today's date in the keeper's zone (P-03, `Idempotency-Key`); `GET /specimens/:id/fertilizing` answers the date of the
 * latest fertilizing, `null` when none is logged. A foreign or unknown plant answers 404 to both (P-05). The sign-in guard
 * is applied by `monitoringRoutes` (`/fertilizing`) and by the app (`/specimens/*`).
 */
export function fertilizingRoutes(pool: Pool, clock: () => Date): Hono<AuthEnv> {
  const deps: FertilizedDependencies = {
    specimens: new SpecimenPostgres(pool),
    fertilizing: new FertilizingPostgres(pool),
    clock,
  };
  const fertilize = monitoringFertilize(deps);
  const writes = { idempotency: new IdempotencyPostgres(pool) };
  const routes = new Hono<AuthEnv>();
  routes.get("/specimens/:id/fertilizing", async (c) => {
    const r = await fertilizingOf(deps, c.get("account").id, c.req.param("id"));
    return r.ok ? c.json(r.value) : c.json(errorBody(r.error), statusFor(r.error));
  });
  routes.post("/fertilizing", async (c) => write(c, writes, fertilize, { input: await body(c) }));
  return routes;
}
