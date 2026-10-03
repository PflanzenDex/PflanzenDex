import { appError, measurementView, measurementRecord } from "@pflanzendex/core";
import {
  SpeciesPostgres,
  SpecimenPostgres,
  IdempotencyPostgres,
  MeasurementsPostgres,
} from "@pflanzendex/db";
import { Hono } from "hono";
import type { Pool } from "pg";
import { errorBody, body, write, type AuthEnv } from "../kernel";

/** Paths the sign-in guard (bearer token) must cover. */
export const CARE_PATHS = ["/specimens/:id/measurements"] as const;

export type CareOptions = {
  /** The clock for "today" (NFR-08); tests pin it. */
  clock?: () => Date;
};

/**
 * Measurements of a specimen (US-WAC-01). Writing goes only through `measurement.record` (P-03, with
 * `Idempotency-Key`); reading returns only measurements of the own account, a foreign or unknown specimen looks the
 * same: 404 (P-04).
 */
export function careRoutes(pool: Pool, opt: CareOptions = {}): Hono<AuthEnv> {
  const specimens = new SpecimenPostgres(pool);
  const measurements = new MeasurementsPostgres(pool);
  const deps = { idempotency: new IdempotencyPostgres(pool) };
  const record = measurementRecord({
    measurements,
    specimens,
    clock: opt.clock ?? (() => new Date()),
  });
  const routes = new Hono<AuthEnv>();

  routes.get("/specimens/:id/measurements", async (c) => {
    const a = await measurementView(
      { measurements, specimens, species: new SpeciesPostgres(pool) },
      c.get("account").id,
      c.req.param("id"),
    );
    return a ? c.json(a) : c.json(errorBody(appError("specimen.not_found")), 404);
  });
  routes.post("/specimens/:id/measurements", async (c) =>
    write(c, deps, record, {
      input: { ...(await body(c)), specimenId: c.req.param("id") },
      success: 201,
    }),
  );
  return routes;
}
