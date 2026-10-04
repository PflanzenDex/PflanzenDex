import { catalogList, catalogMerge, catalogReview, appError } from "@pflanzendex/core";
import { ReviewPostgres, IdempotencyPostgres } from "@pflanzendex/db";
import { Hono } from "hono";
import type { Pool } from "pg";
import { errorBody, body, write, type AuthEnv } from "../kernel";

/** Paths the sign-in guard (bearer token) must cover. */
export const REVIEW_PATHS = ["/review"] as const;

/**
 * Review operations for species proposals (US-BES-10).
 * - GET /review/proposals: list open proposals (reviewers/operators only)
 * - POST /review/:id/decide: approve or reject (reviewers/operators only)
 * - POST /review/:id/merge: merge with existing species (reviewers/operators only)
 */
export function reviewRoutes(pool: Pool): Hono<AuthEnv> {
  const review = new ReviewPostgres(pool);
  const deps = { idempotency: new IdempotencyPostgres(pool) };
  const routes = new Hono<AuthEnv>();

  // List all open proposals (proposals and ai_unreviewed)
  routes.get("/review/proposals", async (c) =>
    write(c, deps, catalogList(review), { input: {}, success: 200 }),
  );

  // Approve or reject a proposal
  routes.post("/review/:id/decide", async (c) =>
    write(c, deps, catalogReview(review), {
      input: { id: c.req.param("id"), ...(await body(c)) },
      success: 200,
    }),
  );

  // Merge a proposal with an existing species
  routes.post("/review/:id/merge", async (c) => {
    const proposalId = c.req.param("id");
    const input = await body(c);

    // Validate the merge input
    if (!input.targetSpeciesId || typeof input.targetSpeciesId !== "string") {
      return c.json(
        errorBody(
          appError("input.invalid", {
            details: [{ field: "targetSpeciesId", code: "input.invalid" }],
          }),
        ),
        400,
      );
    }

    // For now, just call the merge operation
    // In a more complete implementation, we would also validate that the target species exists
    // and that re-pointing would not create conflicts
    return write(c, deps, catalogMerge(review), {
      input: { proposalId, targetSpeciesId: input.targetSpeciesId },
      success: 200,
    });
  });

  return routes;
}
