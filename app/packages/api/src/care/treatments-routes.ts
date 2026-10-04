import { treatmentPlan } from "@pflanzendex/core";
import { IdempotencyPostgres, SpecimenPostgres, TreatmentsPostgres } from "@pflanzendex/db";
import { Hono } from "hono";
import type { Pool } from "pg";
import { body, write, type AuthEnv } from "../kernel";

/** Paths the sign-in guard (bearer token) must cover. */
export const TREATMENT_PATHS = ["/treatments"] as const;

/**
 * Treatments (US-BEH-01). Writing goes only through `treatment.plan` (P-03, with `Idempotency-Key`); a foreign or
 * unknown specimen looks the same: 404, and nothing is written (P-04).
 */
export function treatmentRoutes(pool: Pool): Hono<AuthEnv> {
  const plan = treatmentPlan({
    treatments: new TreatmentsPostgres(pool),
    specimens: new SpecimenPostgres(pool),
    newId: () => crypto.randomUUID(),
  });
  const deps = { idempotency: new IdempotencyPostgres(pool) };
  const routes = new Hono<AuthEnv>();
  routes.post("/treatments", async (c) =>
    write(c, deps, plan, { input: await body(c), success: 201 }),
  );
  return routes;
}
