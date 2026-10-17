import {
  offerCreate,
  offerList,
  offerPreview,
  offerWithdraw,
  type PhaseLocationSource,
  type Result,
} from "@pflanzendex/core";
import { IdempotencyPostgres } from "@pflanzendex/db";
import { Hono, type Context } from "hono";
import type { Pool } from "pg";
import { body, errorBody, statusFor, write, type AuthEnv } from "../../kernel";
import { offerDependencies } from "./wiring";

/** Paths the sign-in guard (bearer token) must cover. */
export const OFFER_PATHS = ["/offers"] as const;

/** Answers a read: the value, or the error with its stable code and HTTP status. */
function reply<T>(c: Context<AuthEnv>, r: Result<T>) {
  return r.ok ? c.json(r.value) : c.json(errorBody(r.error), statusFor(r.error));
}

/**
 * Offers to swap or give away (US-SOZ-08, DM-SOZ-02). Everything runs as the account of the caller (P-04, P-05).
 * - GET /offers?timeZone=…: `{ offers }`, my own offers with health details (open treatment, last treatment: reason and
 *   date only), the care phase of today and the specimen name; withdrawn offers stay listed (P-10)
 * - GET /offers/preview?specimenId=…&timeZone=…: what the dialog shows first: is the specimen shared, does it have an offer,
 *   health, phase, the plant law notice (FR-SOZ-09); 404 `specimen.not_found` for a foreign or unknown specimen
 * - POST /offers `{ specimenId, type, mode, wish?, note?, confirmTreatment? }` (with `Idempotency-Key`): 201 with the offer;
 *   409 `offer.not_shared`, `offer.already_open`, `offer.treatment_open` (needs `confirmTreatment: true`)
 * - POST /offers/:id/withdraw: withdraws it at any time while open or reserved; 404 `offer.not_found`, 409 `offer.not_active`
 */
export function offerRoutes(
  pool: Pool,
  opt: { clock?: () => Date; phaseLocation?: PhaseLocationSource | undefined } = {},
): Hono<AuthEnv> {
  const deps = offerDependencies(pool, opt);
  const idem = { idempotency: new IdempotencyPostgres(pool) };
  const create = offerCreate(deps);
  const withdraw = offerWithdraw(deps);
  const routes = new Hono<AuthEnv>();
  routes.get("/offers", async (c) =>
    reply(c, await offerList(deps, c.get("account").id, c.req.query("timeZone"))),
  );
  routes.get("/offers/preview", async (c) =>
    reply(
      c,
      await offerPreview(
        deps,
        c.get("account").id,
        c.req.query("specimenId"),
        c.req.query("timeZone"),
      ),
    ),
  );
  routes.post("/offers", async (c) =>
    write(c, idem, create, { input: await body(c), success: 201 }),
  );
  routes.post("/offers/:id/withdraw", async (c) =>
    write(c, idem, withdraw, { input: { offerId: c.req.param("id") } }),
  );
  return routes;
}
