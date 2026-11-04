import {
  speciesDisplayName,
  type OwnSpeciesNames,
  type PrivacySwitch,
  type SharedFacts,
  type SpecimenLookup,
} from "@pflanzendex/core";
import {
  ProfilePostgres,
  SpeciesPostgres,
  SpecimenPostgres,
  type SpecimenRow,
} from "@pflanzendex/db";
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
  /**
   * The approved species of the owner by id, read in ONE statement (NFR-12, #1238). Only approved names are shared: a
   * private proposal of the owner stays unknown to friends (P-05).
   */
  const approvedById = async (ownerId: string, ids: readonly string[]) => {
    const found = await species.findMany(ownerId, ids);
    return new Map(
      found.flatMap((s) =>
        s && (s.reviewStatus === "curated" || s.reviewStatus === "reviewed")
          ? [[s.id, s] as const]
          : [],
      ),
    );
  };
  const facts: SharedFacts = {
    async describe(ownerId, ids) {
      // Two statements for any number of shared specimens (NFR-12, #1238): the rows, then their species.
      const rows = await specimens.findMany(ownerId, ids);
      const live = rows.filter(
        (row): row is SpecimenRow => row !== null && row.status !== "archived",
      );
      const approved = await approvedById(
        ownerId,
        live.map((row) => row.speciesId),
      );
      const out = [];
      for (const row of live) {
        const s = approved.get(row.speciesId) ?? null;
        out.push({
          id: row.id,
          speciesLatin: s?.latinName ?? null,
          speciesGerman: s?.germanName ?? null,
          name: row.marker !== null && s ? speciesDisplayName(s) : row.name,
          caughtAt: row.caughtAt,
          isCutting: row.status === "cutting",
          repottedAt: row.repottedAt ?? null,
        });
      }
      return out;
    },
  };
  // The account's own collection (NFR-12, #1238): the species of its active specimens (collection port), their names
  // in one statement (catalog port), not one read per specimen or species.
  const mine: OwnSpeciesNames = {
    async latinNamesOf(userId) {
      const active = (await specimens.list(userId)).filter((s) => s.status !== "archived");
      return species.latinNamesOf(userId, [...new Set(active.map((s) => s.speciesId))]);
    },
  };
  return { lookup, privacy, facts, mine };
}
