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
import { IdempotencyPostgres } from "@pflanzendex/db";
import { Hono, type Context } from "hono";
import type { Pool } from "pg";
import { body, errorBody, statusFor, withoutKey, write, type AuthEnv } from "../../kernel";
import { exchangeDependencies, matchContext } from "./wiring";

/** Paths the sign-in guard (bearer token) must cover; `POST /offers/:id/request` sits under `/offers`. */
export const EXCHANGE_PATHS = ["/exchange"] as const;

function reply<T>(c: Context<AuthEnv>, r: Result<T>) {
  return r.ok ? c.json(r.value) : c.json(errorBody(r.error), statusFor(r.error));
}

/**
 * An offer as a friend sees it: the account id of the giver stays on the server (P-05, US-QG-05); the giver is named by
 * the display name the keeper stored.
 */
const publicOffer = <T extends { ownerId: string }>(offer: T) => withoutKey(offer, "ownerId");

/**
 * The exchange (US-SOZ-09, ADR 0012). Everything runs as the account of the caller; what a friend shows is decided by
 * the database function `friend_offers()` (P-04, P-05).
 * - GET /exchange/offers?timeZone=…[&type=cutting|plant|offshoot][&lack=true]: `{ offers }`, the open offers of
 *   friends with species, type, mode, health details (reason and date only), phase, `lack` ("you lack it", `null` =
 *   unknown), `onWishlist` (a hint, the list is never transmitted, FR-WUN-07) and `requested`
 * - GET /exchange/match?timeZone=…: `{ cards, entries }`, the match deck (US-TAU-01): the same offers narrowed to
 *   species on the own wishlist, each with its `reasons` (the wish, and "fits both ways" when the giver asked for an own offer, US-TAU-05), oldest offer first; no score and no ranking (FR-TAU-06).
 *   `cards` are the offers without an answer plus those answered with Later on an earlier day (US-TAU-06); `entries`
 *   are all answers of the caller (No and Later) with `answeredOn`, the `state` of the offer (`open`, `requested`,
 *   `wish_done`, `unavailable`) and the `card` while it is open, so nothing disappears silently (P-10); `empty` names why
 *   there is no card (`no_friends`, `no_wishes`, `no_offers`, `no_match`) or is `null` (US-TAU-07)
 * - PUT /exchange/match/:offerId/answer `{ answer: "no" | "later", timeZone }` (with `Idempotency-Key`; US-TAU-02):
 *   stores the private answer of the caller, 200 `{ answeredOn }`; 404 `offer.not_found` for an offer that is no card of
 *   the caller (also for a foreign one, P-05); the giver learns nothing (FR-TAU-02)
 * - DELETE /exchange/match/:offerId/answer (with `Idempotency-Key`): takes the answer back (undo, "Reconsider", "Remove
 *   from list"), 200 `{ undone: true }`; 404 `offer.not_found` when there is none
 * - POST /exchange/match/:offerId/yes `{ counterSpecimenId? }` (with `Idempotency-Key`; US-TAU-03, US-TAU-05): the same request
 *   as below, without a return unless an own offer is proposed on a card that fits both ways;
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
  const idem = { idempotency: new IdempotencyPostgres(pool) };
  // Built per request: an owner's species are read once within one request and never kept for the next (NFR-12).
  const ports = () => {
    const deps = exchangeDependencies(pool, offer);
    const context = matchContext(pool, deps, clock);
    return {
      deps,
      context,
      request: swapRequest(deps),
      yes: matchYes(deps, context.answers),
      answer: matchAnswer(deps, context.answers, clock),
      undo: matchUndo(context.answers),
    };
  };
  const routes = new Hono<AuthEnv>();
  routes.get("/exchange/offers", async (c) => {
    const r = await exchangeList(ports().deps, c.get("account").id, c.req.query());
    return r.ok ? c.json({ offers: r.value.offers.map(publicOffer) }) : reply(c, r);
  });
  routes.get("/exchange/match", async (c) => {
    const { deps, context } = ports();
    const r = await matchDeck(deps, context, c.get("account").id, c.req.query());
    if (!r.ok) return reply(c, r);
    return c.json({
      ...r.value,
      cards: r.value.cards.map(publicOffer),
      entries: r.value.entries.map((e) => ({ ...e, card: e.card ? publicOffer(e.card) : null })),
    });
  });
  routes.put("/exchange/match/:offerId/answer", async (c) =>
    write(c, idem, ports().answer, {
      input: { ...(await body(c)), offerId: c.req.param("offerId") },
    }),
  );
  routes.delete("/exchange/match/:offerId/answer", async (c) =>
    write(c, idem, ports().undo, { input: { offerId: c.req.param("offerId") } }),
  );
  routes.post("/exchange/match/:offerId/yes", async (c) =>
    write(c, idem, ports().yes, {
      input: { ...(await body(c)), offerId: c.req.param("offerId") },
      success: 201,
    }),
  );
  routes.post("/offers/:id/request", async (c) =>
    write(c, idem, ports().request, {
      input: { ...(await body(c)), offerId: c.req.param("id") },
      success: 201,
    }),
  );
  return routes;
}
