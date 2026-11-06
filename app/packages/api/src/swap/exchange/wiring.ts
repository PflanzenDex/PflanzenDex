import {
  speciesDisplayName,
  wishNameKey,
  type ExchangeDependencies,
  type MatchContext,
  type OfferDependencies,
  type Species,
  type WishHints,
} from "@pflanzendex/core";
import {
  FriendsPostgres,
  MatchAnswersPostgres,
  OffersPostgres,
  SpeciesPostgres,
  SpecimenPostgres,
  SwapsPostgres,
  WishesPostgres,
  WishVisibilityPostgres,
} from "@pflanzendex/db";
import type { Pool } from "pg";

/**
 * Wiring in the app root (ADR 0012, ADR 0003): `swap` defines the ports, `collection`, `catalog`, `care` and `wishlist`
 * answer them; the modules do not know each other, only the app root does. The facts of a friend's specimen are read as
 * the owner, but only after `friend_offers()` released the offer (confirmed friendship, `Share = friends`, nothing while
 * the owner is "Everything private"); only the species and the name leave this function, and only approved species
 * names (a private proposal stays unknown, P-05). The wishlist answers a yes or no per species, never its list
 * (FR-WUN-07): a wish counts for a species when its folded name equals the folded Latin name.
 */
export function exchangeDependencies(pool: Pool, offer: OfferDependencies): ExchangeDependencies {
  const specimens = new SpecimenPostgres(pool);
  const wishes = new WishesPostgres(pool);
  // One species read per owner for everything built here (NFR-12). The routes build these dependencies per request, so no
  // read outlives its request.
  const speciesOf = speciesOncePer(new SpeciesPostgres(pool));
  const speciesSource = {
    find: async (owner: string, id: string) => (await speciesOf(owner, [id]))[0] ?? null,
    findMany: speciesOf,
  };
  return {
    swaps: new SwapsPostgres(pool),
    treatments: offer.treatments,
    // The phases of a friend's offers take the owner's species from the same read as the facts (NFR-12).
    phases: {
      phasesOf: (owner, ids, timeZone) =>
        offer.phases.phasesOf(owner, ids, timeZone, speciesSource),
    },
    facts: {
      // One read of the specimens and one of their species for all IDs of the owner (NFR-12).
      async describe(ownerId, ids) {
        const rows = (await specimens.findMany(ownerId, ids)).flatMap((r) =>
          r && r.status !== "archived" ? [r] : [],
        );
        const read = await speciesOf(
          ownerId,
          rows.map((r) => r.speciesId),
        );
        return rows.map((row, i) => {
          const s = approvedOf(read[i] ?? null);
          return {
            id: row.id,
            name: row.marker !== null && s ? speciesDisplayName(s) : row.name,
            speciesLatin: s?.latinName ?? null,
            speciesGerman: s?.germanName ?? null,
          };
        });
      },
    },
    mine: {
      async latinNamesOf(userId) {
        const active = (await specimens.list(userId)).filter((s) => s.status !== "archived");
        const read = await speciesOf(userId, [...new Set(active.map((s) => s.speciesId))]);
        return read.flatMap((s) => (s ? [s.latinName] : []));
      },
    },
    wishes: wishHints(wishes),
  };
}

/**
 * One species read per owner for a request (NFR-12, US-SOZ-09, US-TAU-01): the first reader of an owner's species asks the
 * database for the IDs it does not know yet, and every later reader of the request takes them from here. The read runs as
 * the owner (`SpeciesPostgres.findMany`, P-04), and the entries are kept per owner, so one owner's answer never serves
 * another (P-05). An ID asked again while its read is in flight waits for that read.
 */
export function speciesOncePer(species: Pick<SpeciesPostgres, "findMany">) {
  const known = new Map<string, Map<string, Promise<Species | null>>>();
  return (owner: string, ids: readonly string[]): Promise<(Species | null)[]> => {
    const own = known.get(owner) ?? new Map<string, Promise<Species | null>>();
    known.set(owner, own);
    const missing = [...new Set(ids.map(keyOf))].filter((id) => !own.has(id));
    if (missing.length > 0) {
      const read = species.findMany(owner, missing);
      for (const [i, id] of missing.entries())
        own.set(
          id,
          read.then((rows) => rows[i] ?? null),
        );
    }
    return Promise.all(ids.map((id) => own.get(keyOf(id)) as Promise<Species | null>));
  };
}

const keyOf = (id: string) => id.toLowerCase();

/** Only an approved species (curated or reviewed) leaves the owner's account; a private proposal stays unknown (P-05). */
function approvedOf<T extends { reviewStatus: string }>(s: T | null): T | null {
  return s && (s.reviewStatus === "curated" || s.reviewStatus === "reviewed") ? s : null;
}

/**
 * The wishlist answers a yes or no per species and the own reasoning of the wish, never its list (FR-WUN-07): a wish counts
 * for a species when its folded name equals the folded Latin name (US-TAU-04).
 */
function wishHints(wishes: WishesPostgres): WishHints {
  return {
    async onWishlist(userId, latinNames) {
      const keys = new Set((await wishes.open(userId)).map((w) => wishNameKey(w.name)));
      return new Set(latinNames.filter((n) => keys.has(wishNameKey(n))));
    },
    async reasoningOf(userId, latinNames) {
      const written = new Map(
        (await wishes.open(userId)).flatMap((w) =>
          w.reasoning !== null ? [[wishNameKey(w.name), w.reasoning] as const] : [],
        ),
      );
      return new Map(
        latinNames.flatMap((n) => {
          const text = written.get(wishNameKey(n));
          return text !== undefined ? [[n, text] as const] : [];
        }),
      );
    },
  };
}

/**
 * What the match deck needs besides the exchange (US-TAU-02, US-TAU-05, US-TAU-07): the private answers, the clock, the
 * counts that explain an empty deck, and the keeper's own open offers for "fits both ways". Everything is read as the
 * keeper under the row rules (P-04); the species names of the own offers come from the same facts port as the exchange.
 */
export function matchContext(
  pool: Pool,
  deps: ExchangeDependencies,
  clock: () => Date,
): MatchContext {
  const friends = new FriendsPostgres(pool);
  const wishes = new WishesPostgres(pool);
  const offers = new OffersPostgres(pool);
  const visibility = new WishVisibilityPostgres(pool);
  return {
    answers: new MatchAnswersPostgres(pool),
    clock,
    // The marked wishes of friends answer only for the species of the keeper's own open offers (DM-TAU-02, FR-WUN-07).
    friendWishes: {
      async wantedBy(userId, latinNames) {
        const byKey = new Map(latinNames.map((n) => [wishNameKey(n), n]));
        const found = await visibility.friendWants(userId, [...byKey.keys()]);
        return new Map(
          [...found].map(([friend, keys]) => [
            friend,
            new Set([...keys].flatMap((k) => (byKey.has(k) ? [byKey.get(k) as string] : []))),
          ]),
        );
      },
    },
    counts: {
      friends: async (userId) => (await friends.friends(userId)).length,
      wishes: async (userId) => (await wishes.open(userId)).length,
    },
    mine: {
      async open(userId) {
        const open = (await offers.list(userId)).filter((o) => o.status === "open");
        const facts = await deps.facts.describe(
          userId,
          open.map((o) => o.specimenId),
        );
        const byId = new Map(facts.map((f) => [f.id, f]));
        return open.map((o) => ({
          offerId: o.id,
          specimenId: o.specimenId,
          speciesLatin: byId.get(o.specimenId)?.speciesLatin ?? null,
          speciesGerman: byId.get(o.specimenId)?.speciesGerman ?? null,
        }));
      },
    },
  };
}
