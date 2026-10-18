import {
  speciesDisplayName,
  wishNameKey,
  type ExchangeDependencies,
  type MatchContext,
  type OfferDependencies,
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
  const species = new SpeciesPostgres(pool);
  const wishes = new WishesPostgres(pool);
  const approved = async (ownerId: string, id: string) => {
    const s = await species.find(ownerId, id);
    return s && (s.reviewStatus === "curated" || s.reviewStatus === "reviewed") ? s : null;
  };
  return {
    swaps: new SwapsPostgres(pool),
    treatments: offer.treatments,
    phases: offer.phases,
    facts: {
      async describe(ownerId, ids) {
        const out = [];
        for (const id of ids) {
          const row = await specimens.find(ownerId, id);
          if (!row || row.status === "archived") continue;
          const s = await approved(ownerId, row.speciesId);
          out.push({
            id: row.id,
            name: row.marker !== null && s ? speciesDisplayName(s) : row.name,
            speciesLatin: s?.latinName ?? null,
            speciesGerman: s?.germanName ?? null,
          });
        }
        return out;
      },
    },
    mine: {
      async latinNamesOf(userId) {
        const active = (await specimens.list(userId)).filter((s) => s.status !== "archived");
        const names = await Promise.all(
          [...new Set(active.map((s) => s.speciesId))].map(
            async (id) => (await species.find(userId, id))?.latinName ?? null,
          ),
        );
        return names.filter((n): n is string => n !== null);
      },
    },
    wishes: wishHints(wishes),
  };
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
  return {
    answers: new MatchAnswersPostgres(pool),
    clock,
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
