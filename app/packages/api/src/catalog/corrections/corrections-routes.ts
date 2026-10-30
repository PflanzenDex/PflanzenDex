import {
  catalogCorrect,
  catalogCorrectionAccept,
  catalogCorrectionReject,
  catalogCorrectionVote,
  catalogCorrectionWithdraw,
  catalogCorrections,
  catalogFieldHistory,
  catalogFieldRevert,
  myCorrections,
  speciesCorrections,
  type Operation,
  type Result,
} from "@pflanzendex/core";
import { CorrectionPostgres, IdempotencyPostgres, ReviewPostgres } from "@pflanzendex/db";
import { Hono, type Context } from "hono";
import type { Pool } from "pg";
import { body, errorBody, statusFor, write, type AuthEnv } from "../../kernel";

/** Paths the sign-in guard (bearer token) must cover. */
export const CORRECTION_PATHS = [
  "/catalog/corrections",
  "/catalog/history",
  "/catalog/species",
] as const;

/**
 * Corrections of catalog values and the version history of a field (US-BES-16; the proposal is the first cut of
 * US-BES-14). Proposing is open to every signed-in keeper; deciding and reverting are for operators and reviewers only
 * (the operations check the role, the database functions check it again, P-03, P-04). An AI connection never has the
 * role and can therefore never accept, reject or revert (FR-BES-06, FR-KI-09).
 * - POST /catalog/corrections: propose a value `{ speciesId, field, value?, reason, source? }`; without `value` it is a
 *   report that the field is wrong (US-BES-14)
 * - POST /catalog/corrections/:id/withdraw: the creator withdraws an open correction
 * - GET /catalog/corrections: open corrections for the review list (reviewers)
 * - GET /catalog/corrections/mine: the caller's own corrections with status and decision reason
 * - POST /catalog/corrections/:id/accept | /reject `{ reason }`: decide (reviewers)
 * - POST /catalog/corrections/:id/vote `{ vote: confirm | dispute | none }`: a signal for the reviewers (US-BES-15)
 * - GET /catalog/species/:speciesId/corrections: the open corrections of a species with counts and the own vote
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
  const decide = <E, A>(action: string, operation: Operation<E, A>, withBody: boolean) =>
    routes.post(`/catalog/corrections/:id/${action}`, async (c) =>
      write(c, deps, operation, {
        input: { ...(withBody ? await body(c) : {}), id: c.req.param("id") },
        success: 200,
      }),
    );
  decide("accept", catalogCorrectionAccept(corrections, review), false);
  decide("reject", catalogCorrectionReject(corrections, review), true);
  decide("withdraw", catalogCorrectionWithdraw(corrections), false);
  decide("vote", catalogCorrectionVote(corrections), true);
  routes.get("/catalog/species/:speciesId/corrections", async (c) =>
    read(c, await speciesCorrections(corrections, c.get("account").id, c.req.param("speciesId"))),
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
