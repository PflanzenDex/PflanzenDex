import { catalogList, catalogMerge, catalogReview } from "@pflanzendex/core";
import {
  IdempotencyPostgres,
  ReviewPostgres,
  SpeciesPostgres,
  type SpeciesRepointer,
} from "@pflanzendex/db";
import { Hono } from "hono";
import type { Pool } from "pg";
import { body, errorBody, statusFor, write, type AuthEnv } from "../kernel";

/** Paths the sign-in guard (bearer token) must cover. */
export const REVIEW_PATHS = ["/review"] as const;

/**
 * Review of catalog proposals (US-BES-10), for operators and reviewers only (the operations check the role, the
 * database enforces it again, P-04). `repointers` are the ports of the modules that reference species; the
 * composition root passes them in (ADR 0003), so a merge re-points specimens and care profiles atomically.
 * - GET /review: open proposals and operator batches with issues and duplicate hints
 * - POST /review/:id/decide: approve (`reviewed`) or reject with a reason
 * - POST /review/:id/merge: fold the proposal into an existing species
 */
export function reviewRoutes(
  pool: Pool,
  repointers: readonly SpeciesRepointer[] = [],
): Hono<AuthEnv> {
  const review = new ReviewPostgres(pool, repointers);
  const species = new SpeciesPostgres(pool);
  const deps = { idempotency: new IdempotencyPostgres(pool) };
  const routes = new Hono<AuthEnv>();

  routes.get("/review", async (c) => {
    const r = await catalogList(review, species, c.get("account").id);
    return r.ok ? c.json(r.value) : c.json(errorBody(r.error), statusFor(r.error));
  });
  routes.post("/review/:id/decide", async (c) =>
    write(c, deps, catalogReview(review, species), {
      input: { ...(await body(c)), id: c.req.param("id") },
      success: 200,
    }),
  );
  routes.post("/review/:id/merge", async (c) =>
    write(c, deps, catalogMerge(review, species), {
      input: { ...(await body(c)), proposalId: c.req.param("id") },
      success: 200,
    }),
  );
  return routes;
}
