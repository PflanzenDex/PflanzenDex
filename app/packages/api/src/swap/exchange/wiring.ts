import {
  speciesDisplayName,
  wishNameKey,
  type ExchangeDependencies,
  type OfferDependencies,
} from "@pflanzendex/core";
import { SpeciesPostgres, SpecimenPostgres, SwapsPostgres, WishesPostgres } from "@pflanzendex/db";
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
    wishes: {
      async onWishlist(userId, latinNames) {
        const keys = new Set((await wishes.open(userId)).map((w) => wishNameKey(w.name)));
        return new Set(latinNames.filter((n) => keys.has(wishNameKey(n))));
      },
    },
  };
}
