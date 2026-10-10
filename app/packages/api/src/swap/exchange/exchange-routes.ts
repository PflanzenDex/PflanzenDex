import { exchangeList, swapRequest, type OfferDependencies, type Result } from "@pflanzendex/core";
import { IdempotencyPostgres } from "@pflanzendex/db";
import { Hono, type Context } from "hono";
import type { Pool } from "pg";
import { body, errorBody, statusFor, write, type AuthEnv } from "../../kernel";
import { exchangeDependencies } from "./wiring";

/** Paths the sign-in guard (bearer token) must cover; `POST /offers/:id/request` sits under `/offers`. */
export const EXCHANGE_PATHS = ["/exchange"] as const;

function reply<T>(c: Context<AuthEnv>, r: Result<T>) {
  return r.ok ? c.json(r.value) : c.json(errorBody(r.error), statusFor(r.error));
}

/**
 * The exchange (US-SOZ-09, ADR 0012). Everything runs as the account of the caller; what a friend shows is decided by
 * the database function `friend_offers()` (P-04, P-05).
 * - GET /exchange/offers?timeZone=…[&type=cutting|plant|offshoot][&lack=true]: `{ offers }`, the open offers of
 *   friends with species, type, mode, health details (reason and date only), phase, `lack` ("you lack it", `null` =
 *   unknown), `onWishlist` (a hint, the list is never transmitted, FR-WUN-07) and `requested`
 * - POST /offers/:id/request `{ counterSpecimenId?, counterText? }` (with `Idempotency-Key`): 201 `{ swapId }`; 404
 *   `offer.not_found` (also for a foreign or unknown offer), 409 `swap.own_offer`, `offer.not_active`,
 *   `swap.already_requested`, `swap.counter_not_allowed`, `swap.counter_not_shared`, 404 `specimen.not_found`
 */
export function exchangeRoutes(pool: Pool, offer: OfferDependencies): Hono<AuthEnv> {
  const deps = exchangeDependencies(pool, offer);
  const idem = { idempotency: new IdempotencyPostgres(pool) };
  const request = swapRequest(deps);
  const routes = new Hono<AuthEnv>();
  routes.get("/exchange/offers", async (c) =>
    reply(c, await exchangeList(deps, c.get("account").id, c.req.query())),
  );
  routes.post("/offers/:id/request", async (c) =>
    write(c, idem, request, {
      input: { ...(await body(c)), offerId: c.req.param("id") },
      success: 201,
    }),
  );
  return routes;
}
