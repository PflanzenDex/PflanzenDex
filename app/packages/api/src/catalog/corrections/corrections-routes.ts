import {
  catalogCorrect,
  catalogCorrectionAccept,
  catalogCorrectionReject,
  catalogCorrections,
  catalogFieldHistory,
  catalogFieldRevert,
  myCorrections,
  type Result,
} from "@pflanzendex/core";
import { CorrectionPostgres, IdempotencyPostgres, ReviewPostgres } from "@pflanzendex/db";
import { Hono, type Context } from "hono";
import type { Pool } from "pg";
import { body, errorBody, statusFor, write, type AuthEnv } from "../../kernel";

/** Paths the sign-in guard (bearer token) must cover. */
export const CORRECTION_PATHS = ["/catalog/corrections", "/catalog/history"] as const;

/**
 * Corrections of catalog values and the version history of a field (US-BES-16; the proposal is the first cut of
 * US-BES-14). Proposing is open to every signed-in keeper; deciding and reverting are for operators and reviewers only
 * (the operations check the role, the database functions check it again, P-03, P-04). An AI connection never has the
 * role and can therefore never accept, reject or revert (FR-BES-06, FR-KI-09).
 * - POST /catalog/corrections: propose a value `{ speciesId, field, value, reason, source? }`
 * - GET /catalog/corrections: open corrections for the review list (reviewers)
 * - GET /catalog/corrections/mine: the caller's own corrections with status and decision reason
 * - POST /catalog/corrections/:id/accept | /reject `{ reason }`: decide (reviewers)
 * - GET /catalog/history/:speciesId/:field: every version of a field with value, source, origin and date
 * - POST /catalog/history/:speciesId/:field/revert `{ version }`: the earlier value comes back as a new version
 */
export function correctionRoutes(pool: Pool): Hono<AuthEnv> {
  const corrections = new CorrectionPostgres(pool);
  const review = new ReviewPostgres(pool);
  const deps = { idempotency: new IdempotencyPostgres(pool) };
  const routes = new Hono<AuthEnv>();

  const read = (c: Context<AuthEnv>, r: Result<unknown>) =>
    r.ok ? c.json(r.value) : c.json(errorBody(r.error), statusFor(r.error));

  routes.post("/catalog/corrections", async (c) =>
    write(c, deps, catalogCorrect(corrections), { input: await body(c), success: 201 }),
  );
  routes.get("/catalog/corrections/mine", async (c) =>
    read(c, await myCorrections(corrections, c.get("account").id)),
  );
  routes.get("/catalog/corrections", async (c) =>
    read(c, await catalogCorrections(corrections, review, c.get("account").id)),
  );
  routes.post("/catalog/corrections/:id/accept", async (c) =>
    write(c, deps, catalogCorrectionAccept(corrections, review), {
      input: { id: c.req.param("id") },
      success: 200,
    }),
  );
  routes.post("/catalog/corrections/:id/reject", async (c) =>
    write(c, deps, catalogCorrectionReject(corrections, review), {
      input: { ...(await body(c)), id: c.req.param("id") },
      success: 200,
    }),
  );
  routes.get("/catalog/history/:speciesId/:field", async (c) =>
    read(
      c,
      await catalogFieldHistory(corrections, review, c.get("account").id, {
        speciesId: c.req.param("speciesId"),
        field: c.req.param("field"),
      }),
    ),
  );
  routes.post("/catalog/history/:speciesId/:field/revert", async (c) =>
    write(c, deps, catalogFieldRevert(corrections, review), {
      input: {
        ...(await body(c)),
        speciesId: c.req.param("speciesId"),
        field: c.req.param("field"),
      },
      success: 200,
    }),
  );
  return routes;
}
