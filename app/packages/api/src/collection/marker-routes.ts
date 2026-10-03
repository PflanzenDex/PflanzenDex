import { specimenMark } from "@pflanzendex/core";
import { SpeciesPostgres, SpecimenPostgres, IdempotencyPostgres } from "@pflanzendex/db";
import { Hono } from "hono";
import type { Pool } from "pg";
import { body, write, type AuthEnv } from "../kernel";

/**
 * Give a specimen a marker or change it (US-BES-03). Writing goes only through `specimen.mark` (P-03, with
 * `Idempotency-Key`); a foreign or unknown specimen looks the same: 404 (P-04).
 */
export function markerRoutes(pool: Pool): Hono<AuthEnv> {
  const mark = specimenMark({
    specimens: new SpecimenPostgres(pool),
    species: new SpeciesPostgres(pool),
  });
  const deps = { idempotency: new IdempotencyPostgres(pool) };
  const routes = new Hono<AuthEnv>();
  routes.post("/specimens/:id/marker", async (c) =>
    write(c, deps, mark, { input: { ...(await body(c)), specimenId: c.req.param("id") } }),
  );
  return routes;
}
