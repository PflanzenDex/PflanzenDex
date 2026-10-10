import { swapAnswer, swapHandover, swapOverview } from "@pflanzendex/core";
import { IdempotencyPostgres, SpeciesPostgres, SwapsPostgres } from "@pflanzendex/db";
import { Hono } from "hono";
import type { Pool } from "pg";
import { body, write, type AuthEnv } from "../../kernel";

/** Paths the sign-in guard (bearer token) must cover. */
export const SWAP_PATHS = ["/swaps"] as const;

/**
 * Swaps between friends (US-SOZ-10, ADR 0012). Each account reads and changes only its own side (P-04).
 * - GET /swaps: `{ received, sent }`, my side of every swap (requests for my offers and requests I sent) with the state,
 *   the counter-offer, the reason of a decline and the cause of an automatic end; a swap behind an ended friendship is
 *   canceled first
 * - POST /swaps/:id/answer `{ action: accept|decline|propose|cancel|withdraw, reason?, proposal? }` (with
 *   `Idempotency-Key`): 200 `{ status }`; 404 `swap.not_found`, 409 `swap.not_allowed`, `swap.wrong_state`,
 *   `offer.not_active` (the offer is withdrawn or reserved for another), `swap.friendship_ended`
 * - POST /swaps/:id/handover `{ timeZone, marker? }` (with `Idempotency-Key`, US-SOZ-11): confirms the handover of an
 *   accepted swap; 200 `{ status: "waiting" }` until both sides confirmed, then `{ status: "handed_over",
 *   receivedSpecimenId }` (the giver's specimen is archived and the recipient gets a new one, in one transaction);
 *   409 `specimen.marker_required` (the recipient names a marker), `specimen.name_taken`, `swap.wrong_state`,
 *   `swap.friendship_ended`, 404 `swap.not_found`, `species.not_found`, `specimen.not_found`; a refusal changes nothing
 */
export function swapRoutes(pool: Pool, clock: () => Date = () => new Date()): Hono<AuthEnv> {
  const swaps = new SwapsPostgres(pool);
  const idem = { idempotency: new IdempotencyPostgres(pool) };
  const answer = swapAnswer({ swaps });
  const handover = swapHandover({ swaps, species: new SpeciesPostgres(pool), clock });
  const routes = new Hono<AuthEnv>();
  routes.get("/swaps", async (c) => c.json(await swapOverview({ swaps }, c.get("account").id)));
  routes.post("/swaps/:id/answer", async (c) =>
    write(c, idem, answer, { input: { ...(await body(c)), swapId: c.req.param("id") } }),
  );
  routes.post("/swaps/:id/handover", async (c) =>
    write(c, idem, handover, { input: { ...(await body(c)), swapId: c.req.param("id") } }),
  );
  return routes;
}

/** The hook after ending a friendship (ADR 0012): cancels the open swaps that lost their friendship. */
export const cancelOrphanedSwaps = (pool: Pool) => {
  const swaps = new SwapsPostgres(pool);
  return async (userId: string): Promise<void> => void (await swaps.cancelOrphaned(userId));
};
