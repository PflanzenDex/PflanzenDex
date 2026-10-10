import {
  appError,
  discoverDecide,
  isTimeZone,
  suggestions,
  type ZoneStockSource,
} from "@pflanzendex/core";
import {
  IdempotencyPostgres,
  SpeciesPostgres,
  SpecimenPostgres,
  TaxonomyPostgres,
  WishesPostgres,
} from "@pflanzendex/db";
import { Hono, type Context, type MiddlewareHandler } from "hono";
import type { Pool } from "pg";
import { body, errorBody, write, type AuthEnv } from "../kernel";
import { zoneStockFor } from "../zone-stock";

/** Paths the sign-in guard (bearer token) must cover. */
const DISCOVER_PATHS = ["/discover"] as const;

const MAX_DECK = 1000;

/**
 * Discover (US-ENT-01): `GET /discover/suggestions?timeZone=<IANA>&deck=<n>` answers one deck of suggestions as a
 * derived view (P-01): catalog tree, ownership and wishes of the own account only (P-04, P-05); nothing is stored.
 * `deck` starts at 1 and defaults to 1 ("New deck" asks for the next one). Without a valid `timeZone` or `deck` the
 * answer is 400 `input.invalid`. The reasons (US-ENT-03) name the own stock per light zone, read through the port
 * `ZoneStockSource` that the app root fills from the light distribution (US-LIC-02). The guard is applied here, so the module needs only this one line in the app.
 * Decisions (US-ENT-04): `POST /discover/decisions` `{ species, decision: yes|no|later, timeZone }` (with
 * `Idempotency-Key`) runs `discover.decide` and answers `{ decision, saved }`; Yes writes an open wish with
 * `source: discover`, No a discarded one, Later nothing. A species that is not suggested to the account is refused with
 * 409 `discover.not_suggested`. The decision is as private as the wishlist (P-04, FR-ENT-08).
 */
export function discoverRoutes(
  pool: Pool,
  auth: MiddlewareHandler,
  stock: ZoneStockSource = zoneStockFor(pool),
): Hono<AuthEnv> {
  const specimens = new SpecimenPostgres(pool);
  const species = new SpeciesPostgres(pool);
  const taxa = new TaxonomyPostgres(pool);
  const deps = {
    ownership: { specimens, species },
    tree: { tree: () => taxa.tree(), facts: (userId: string) => species.approvedFacts(userId) },
    wishes: new WishesPostgres(pool),
    stock,
  };
  const decide = discoverDecide({ ...deps, clock: () => new Date() });
  const writes = { idempotency: new IdempotencyPostgres(pool) };
  const routes = new Hono<AuthEnv>();
  for (const path of DISCOVER_PATHS) routes.use(path, auth).use(`${path}/*`, auth);
  routes.get("/discover/suggestions", async (c) => {
    const timeZone = c.req.query("timeZone");
    const deck = Number(c.req.query("deck") ?? "1");
    if (!isTimeZone(timeZone)) return invalid(c, "timeZone");
    if (!validDeck(deck)) return invalid(c, "deck");
    return c.json(await suggestions(deps, c.get("account").id, timeZone, deck));
  });
  routes.post("/discover/decisions", async (c) =>
    write(c, writes, decide, { input: await body(c) }),
  );
  return routes;
}

const invalid = (c: Context<AuthEnv>, field: string) =>
  c.json(
    errorBody(appError("input.invalid", { details: [{ field, code: "input.invalid" }] })),
    400,
  );

const validDeck = (n: number) => Number.isInteger(n) && n >= 1 && n <= MAX_DECK;
