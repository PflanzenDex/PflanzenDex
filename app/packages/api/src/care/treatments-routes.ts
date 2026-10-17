import {
  treatmentComplete,
  treatmentHistory,
  treatmentOpenList,
  treatmentPlan,
} from "@pflanzendex/core";
import { IdempotencyPostgres, SpecimenPostgres, TreatmentsPostgres } from "@pflanzendex/db";
import { Hono } from "hono";
import type { Pool } from "pg";
import { body, errorBody, statusFor, write, type AuthEnv } from "../kernel";

/** Paths the sign-in guard (bearer token) must cover. */
export const TREATMENT_PATHS = ["/treatments"] as const;

export type TreatmentOptions = {
  /** The clock for "today" (NFR-08); tests pin it. */
  clock?: () => Date;
};

/**
 * Treatments (US-BEH-01, US-BEH-02, US-BEH-03). Writing goes only through `treatment.plan` and `treatment.complete`
 * (P-03, with `Idempotency-Key`); a foreign or unknown specimen or treatment looks the same: 404, and nothing is
 * written (P-04). The list of open treatments and the history per specimen are read only and derived on every
 * request; `timeZone` (IANA name) decides what "today" is (NFR-08).
 */
export function treatmentRoutes(pool: Pool, opt: TreatmentOptions = {}): Hono<AuthEnv> {
  const plan = treatmentPlan({
    treatments: new TreatmentsPostgres(pool),
    specimens: new SpecimenPostgres(pool),
    newId: () => crypto.randomUUID(),
  });
  const complete = treatmentComplete({
    treatments: new TreatmentsPostgres(pool),
    specimens: new SpecimenPostgres(pool),
    clock: opt.clock ?? (() => new Date()),
  });
  const deps = { idempotency: new IdempotencyPostgres(pool) };
  const list = {
    specimens: new SpecimenPostgres(pool),
    treatments: new TreatmentsPostgres(pool),
    clock: opt.clock ?? (() => new Date()),
  };
  const routes = new Hono<AuthEnv>();
  routes.get("/treatments", async (c) => {
    const r = await treatmentOpenList(list, c.get("account").id, c.req.query("timeZone"));
    return r.ok ? c.json({ treatments: r.value }) : c.json(errorBody(r.error), statusFor(r.error));
  });
  // Before `/treatments/:id/...`: the history is a fixed path.
  routes.get("/treatments/history", async (c) => {
    const r = await treatmentHistory(
      { specimens: list.specimens, treatments: list.treatments },
      c.get("account").id,
      c.req.query("specimenId"),
    );
    return r.ok ? c.json({ treatments: r.value }) : c.json(errorBody(r.error), statusFor(r.error));
  });
  routes.post("/treatments/:id/complete", async (c) =>
    write(c, deps, complete, { input: { ...(await body(c)), id: c.req.param("id") } }),
  );
  routes.post("/treatments", async (c) =>
    write(c, deps, plan, { input: await body(c), success: 201 }),
  );
  return routes;
}
