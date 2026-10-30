import { catalogGaps } from "@pflanzendex/core";
import { CatalogGapsPostgres, ReviewPostgres } from "@pflanzendex/db";
import { Hono } from "hono";
import type { Pool } from "pg";
import { errorBody, statusFor, type AuthEnv } from "../../kernel";

/** Paths the sign-in guard (bearer token) must cover. */
export const GAP_PATHS = ["/catalog/gaps"] as const;

/**
 * Gap list of the shared catalog (US-BES-13), read only, for operators and reviewers: per approved species the
 * fields still "unknown", the source and time of the last check and the next step for each gap (P-08, P-09).
 * Filling happens in the fill job (US-BES-12); the AI research hands in through the validating profile operations.
 */
export function gapRoutes(pool: Pool): Hono<AuthEnv> {
  const gaps = new CatalogGapsPostgres(pool);
  const roles = new ReviewPostgres(pool);
  const routes = new Hono<AuthEnv>();
  routes.get("/catalog/gaps", async (c) => {
    const r = await catalogGaps(gaps, roles, c.get("account").id);
    return r.ok ? c.json(r.value) : c.json(errorBody(r.error), statusFor(r.error));
  });
  return routes;
}
