import {
  exchangeList,
  matchAnswer,
  matchDeck,
  matchUndo,
  matchYes,
  swapRequest,
  type OfferDependencies,
  type Result,
} from "@pflanzendex/core";
import {
  FriendsPostgres,
  IdempotencyPostgres,
  MatchAnswersPostgres,
  WishesPostgres,
} from "@pflanzendex/db";
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
 * - GET /exchange/match?timeZone=…: `{ cards, entries }`, the match deck (US-TAU-01): the same offers narrowed to
 *   species on the own wishlist, each with its `reasons`, oldest offer first; no score and no ranking (FR-TAU-06).
 *   `cards` are the offers without an answer plus those answered with Later on an earlier day (US-TAU-06); `entries`
 *   are all answers of the caller (No and Later) with `answeredOn`, the `state` of the offer (`open`, `requested`,
 *   `wish_done`, `unavailable`) and the `card` while it is open, so nothing disappears silently (P-10); `empty` names why
 *   there is no card (`no_friends`, `no_wishes`, `no_offers`, `no_match`) or is `null` (US-TAU-07)
 * - PUT /exchange/match/:offerId/answer `{ answer: "no" | "later", timeZone }` (with `Idempotency-Key`; US-TAU-02):
 *   stores the private answer of the caller, 200 `{ answeredOn }`; 404 `offer.not_found` for an offer that is no card of
 *   the caller (also for a foreign one, P-05); the giver learns nothing (FR-TAU-02)
 * - DELETE /exchange/match/:offerId/answer (with `Idempotency-Key`): takes the answer back (undo, "Reconsider", "Remove
 *   from list"), 200 `{ undone: true }`; 404 `offer.not_found` when there is none
 * - POST /exchange/match/:offerId/yes (with `Idempotency-Key`; US-TAU-03): the same request as below, without a return;
 *   201 `{ outcome: "requested", swapId }` or `{ outcome: "already_requested", swapId: null }` (no second request); the
 *   refusals are those of the request: 404 `offer.not_found`, 409 `offer.not_active`, `swap.own_offer`
 * - POST /offers/:id/request `{ counterSpecimenId?, counterText? }` (with `Idempotency-Key`): 201 `{ swapId }`; 404
 *   `offer.not_found` (also for a foreign or unknown offer), 409 `swap.own_offer`, `offer.not_active`,
 *   `swap.already_requested`, `swap.counter_not_allowed`, `swap.counter_not_shared`, 404 `specimen.not_found`
 */
export function exchangeRoutes(
  pool: Pool,
  offer: OfferDependencies,
  clock: () => Date = () => new Date(),
): Hono<AuthEnv> {
  const deps = exchangeDependencies(pool, offer);
  const idem = { idempotency: new IdempotencyPostgres(pool) };
  const request = swapRequest(deps);
  const answers = new MatchAnswersPostgres(pool);
  const friends = new FriendsPostgres(pool);
  const wishes = new WishesPostgres(pool);
  const counts = {
    friends: async (userId: string) => (await friends.friends(userId)).length,
    wishes: async (userId: string) => (await wishes.open(userId)).length,
  };
  const yes = matchYes(deps, answers);
  const answer = matchAnswer(deps, answers, clock);
  const undo = matchUndo(answers);
  const routes = new Hono<AuthEnv>();
  routes.get("/exchange/offers", async (c) =>
    reply(c, await exchangeList(deps, c.get("account").id, c.req.query())),
  );
  routes.get("/exchange/match", async (c) =>
    reply(c, await matchDeck(deps, { answers, clock, counts }, c.get("account").id, c.req.query())),
  );
  routes.put("/exchange/match/:offerId/answer", async (c) =>
    write(c, idem, answer, { input: { ...(await body(c)), offerId: c.req.param("offerId") } }),
  );
  routes.delete("/exchange/match/:offerId/answer", async (c) =>
    write(c, idem, undo, { input: { offerId: c.req.param("offerId") } }),
  );
  routes.post("/exchange/match/:offerId/yes", async (c) =>
    write(c, idem, yes, { input: { offerId: c.req.param("offerId") }, success: 201 }),
  );
  routes.post("/offers/:id/request", async (c) =>
    write(c, idem, request, {
      input: { ...(await body(c)), offerId: c.req.param("id") },
      success: 201,
    }),
  );
  return routes;
}
