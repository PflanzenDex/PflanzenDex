import {
  appError,
  isTimeZone,
  pokedexMarkSeen,
  pokedexOwnership,
  readCollectorCards,
} from "@pflanzendex/core";
import {
  IdempotencyPostgres,
  PokedexStatePostgres,
  SpeciesPostgres,
  SpecimenPostgres,
  TaxonomyPostgres,
} from "@pflanzendex/db";
import { Hono, type Context } from "hono";
import type { Pool } from "pg";
import { body, errorBody, write, type AuthEnv } from "../kernel";

const zoneOf = (c: Context<AuthEnv>) => {
  const zone = c.req.query("timeZone");
  return isTimeZone(zone) ? zone : null;
};
const invalidZone = (c: Context<AuthEnv>) =>
  c.json(
    errorBody(
      appError("input.invalid", { details: [{ field: "timeZone", code: "input.invalid" }] }),
    ),
    400,
  );

export const POKEDEX_PATHS = ["/pokedex"] as const;

/**
 * Ownership of species derived from the specimens (US-POK-06) with the catch date (US-POK-07): read only, nothing
 * stored (P-01). Only data of the own account flows in (P-04). `timeZone` (IANA name, the profile zone with the device
 * zone as fallback, chosen by the client, US-ACC-02) decides the local date of a creation moment (NFR-08).
 * The seen state (US-POK-12) is the only thing stored: `GET /pokedex/seen` answers `{ seen }` (`null` before the first
 * visit), `POST /pokedex/seen` marks species as seen and runs through `pokedex.mark_seen` (P-03, with `Idempotency-Key`);
 * "new" is derived by the client as caught minus seen. Both only touch the own account (P-04).
 */
export function pokedexRoutes(pool: Pool): Hono<AuthEnv> {
  const deps = { specimens: new SpecimenPostgres(pool), species: new SpeciesPostgres(pool) };
  const states = new PokedexStatePostgres(pool);
  const markSeen = pokedexMarkSeen({ seen: states, ownership: deps });
  const writeDeps = { idempotency: new IdempotencyPostgres(pool) };
  const routes = new Hono<AuthEnv>();
  routes.get("/pokedex/ownership", async (c) => {
    const timeZone = zoneOf(c);
    if (timeZone === null) return invalidZone(c);
    return c.json({ ownership: await pokedexOwnership(deps, c.get("account").id, timeZone) });
  });
  routes.get("/pokedex/seen", async (c) =>
    c.json({ seen: await states.find(c.get("account").id) }),
  );
  routes.post("/pokedex/seen", async (c) =>
    write(c, writeDeps, markSeen, { input: await body(c) }),
  );
  // Collector cards (US-POK-01): the shared taxonomy tree against the derived ownership; caught is never stored.
  const taxa = new TaxonomyPostgres(pool);
  const tree = {
    tree: () => taxa.tree(),
    facts: (userId: string) => deps.species.approvedFacts(userId),
  };
  routes.get("/pokedex/cards", async (c) => {
    const timeZone = zoneOf(c);
    if (timeZone === null) return invalidZone(c);
    const userId = c.get("account").id;
    const { caught } = await pokedexOwnership(deps, userId, timeZone);
    return c.json({ cards: await readCollectorCards(tree, userId, caught) });
  });
  return routes;
}
