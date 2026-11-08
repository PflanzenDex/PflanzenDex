import {
  appError,
  isTimeZone,
  pokedexMarkSeen,
  pokedexOwnership,
  pokedexTreeOf,
  readAppRarityBasis,
  readCollectorCards,
} from "@pflanzendex/core";
import {
  ActiveSpeciesPostgres,
  IdempotencyPostgres,
  ProfilePostgres,
  PokedexStatePostgres,
  SpeciesPostgres,
  SpecimenPostgres,
  TaxonomyPostgres,
} from "@pflanzendex/db";
import { Hono, type Context } from "hono";
import type { Pool } from "pg";
import { body, errorBody, write, type AuthEnv } from "../kernel";
import { sharedTreeCache } from "./cards-cache";

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
  // One kept tree per app instance, read by the cards and by the tree route alike (FR-POK-13, NFR-12).
  const kept = keptTaxonomy(pool);
  const cards = collectorCardsFor(pool, kept);
  routes.get("/pokedex/cards", async (c) => {
    const timeZone = zoneOf(c);
    if (timeZone === null) return invalidZone(c);
    return c.json(await cards(c.get("account").id, timeZone));
  });
  // The progress (US-POK-10, US-POK-11): the tree rows with the German names; `tree` is `null` before the first build.
  routes.get("/pokedex/tree", async (c) => {
    const { built, tree } = await kept();
    const facts = await deps.species.approvedFacts(c.get("account").id);
    return c.json({ tree: pokedexTreeOf(built ? tree : null, facts) });
  });
  return routes;
}

/** The taxonomy tree kept per build (FR-POK-13): one cache per app instance, no module-level state. */
function keptTaxonomy(pool: Pool) {
  const taxa = new TaxonomyPostgres(pool);
  return sharedTreeCache({ version: () => taxa.version(), tree: () => taxa.tree() });
}

/**
 * Collector cards (US-POK-01) as `GET /pokedex/cards` answers them, for the route and the AI client (US-KI-12): the
 * shared taxonomy tree against the derived ownership; caught is never stored (P-01). The tree is kept per taxonomy build
 * (FR-POK-13, cards-cache.ts); the facts and the rarity are read per request.
 */
export function collectorCardsFor(pool: Pool, kept = keptTaxonomy(pool)) {
  const deps = { specimens: new SpecimenPostgres(pool), species: new SpeciesPostgres(pool) };
  const tree = {
    tree: async () => (await kept()).tree,
    facts: (userId: string) => deps.species.approvedFacts(userId),
    // Rarity in PflanzenDex (US-POK-14): only counts of the consenting accounts, never an account.
    appRarity: (userId: string) =>
      readAppRarityBasis(
        {
          participants: new ProfilePostgres(pool),
          owned: new ActiveSpeciesPostgres(pool),
          species: deps.species,
        },
        userId,
      ),
  };
  return async (userId: string, timeZone: string) => {
    const { caught } = await pokedexOwnership(deps, userId, timeZone);
    return { cards: await readCollectorCards(tree, userId, caught) };
  };
}
