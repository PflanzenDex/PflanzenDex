import {
  speciesDisplayName,
  type OwnSpeciesNames,
  type PrivacySwitch,
  type SharedFacts,
  type SpecimenLookup,
} from "@pflanzendex/core";
import { ProfilePostgres, SpeciesPostgres, SpecimenPostgres } from "@pflanzendex/db";
import type { Pool } from "pg";

/**
 * Wiring in the app root (ADR 0003): `social` defines the ports, `collection`, `catalog` and `account` answer them; the
 * modules do not know each other, only the app root does. The facts of a friend's specimen are read as the owner, but
 * only after `friend_shares()` proved the confirmed friendship and the sharing row, and only these fields leave
 * this function (US-SOZ-04: species, name, caught date, cutting yes/no; never location, markers, measurements,
 * treatments, prices, wishlist). A marker is part of the stored specimen name (DM-BES-03), so the name shown to a
 * friend is the species name alone when the specimen has a marker (assumption, decided by the PO).
 */
export function sharingPorts(pool: Pool) {
  const specimens = new SpecimenPostgres(pool);
  const species = new SpeciesPostgres(pool);
  const profiles = new ProfilePostgres(pool);
  const lookup: SpecimenLookup = {
    find: async (userId, id) => specimens.find(userId, id),
    list: async (userId) => specimens.list(userId),
  };
  const privacy: PrivacySwitch = {
    everythingPrivate: async (userId) => (await profiles.find(userId))?.everythingPrivate ?? false,
  };
  /** Only approved species names are shared: a private proposal of the owner stays unknown to friends (P-05). */
  const approved = async (ownerId: string, id: string) => {
    const s = await species.find(ownerId, id);
    return s && (s.reviewStatus === "curated" || s.reviewStatus === "reviewed") ? s : null;
  };
  const facts: SharedFacts = {
    async describe(ownerId, ids) {
      const rows = await Promise.all(ids.map((id) => specimens.find(ownerId, id)));
      const out = [];
      for (const row of rows) {
        if (!row || row.status === "archived") continue;
        const s = await approved(ownerId, row.speciesId);
        out.push({
          id: row.id,
          speciesLatin: s?.latinName ?? null,
          speciesGerman: s?.germanName ?? null,
          name: row.marker !== null && s ? speciesDisplayName(s) : row.name,
          caughtAt: row.caughtAt,
          isCutting: row.status === "cutting",
        });
      }
      return out;
    },
  };
  const mine: OwnSpeciesNames = {
    async latinNamesOf(userId) {
      const active = (await specimens.list(userId)).filter((s) => s.status !== "archived");
      const names = await Promise.all(
        [...new Set(active.map((s) => s.speciesId))].map(
          async (id) => (await species.find(userId, id))?.latinName ?? null,
        ),
      );
      return names.filter((n): n is string => n !== null);
    },
  };
  return { lookup, privacy, facts, mine };
}
