import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { collectorCards } from "@pflanzendex/core";
import { holdTaxonLock, migrate, openFixturePool, TaxonomyPostgres } from "@pflanzendex/db";
import { BEN_SPECIMENS } from "../demo-seed/accounts/ben/ben-plants.ts";
import { SEED_SPECIES } from "./species-list.ts";
import { seedTaxonFixture, taxonFixtureRows, TAXON_FIXTURE_FINGERPRINT } from "./taxon-fixture.ts";

// The demo seed's Pokédex tree (issue 1164): no foreign servers, nothing invented (P-08). Real PostgreSQL; `taxon` is
// shared, so the test holds the taxon lock and works inside a transaction it rolls back.
let admin: Pool;
let release: () => Promise<void>;
beforeAll(async () => {
  admin = openFixturePool();
  await migrate(admin);
  release = await holdTaxonLock(admin);
});
afterAll(async () => {
  await release();
  await admin.end();
});

describe("US-QS-15 the demo seed brings a Pokédex tree (issue 1164)", () => {
  it("US-QS-15 every seed species gets its genus, its family and the order of that family", () => {
    const rows = taxonFixtureRows();
    expect(rows).toHaveLength(SEED_SPECIES.length);
    expect(rows.find((r) => r.latinName === "Monstera deliciosa")).toEqual({
      latinName: "Monstera deliciosa",
      genus: "Monstera",
      family: "Araceae",
      order: "Alismatales",
    });
    expect(rows.find((r) => r.latinName === "Adiantum raddianum")?.order).toBe("Polypodiales");
  });

  it("US-QS-15 a family without a known order fails loudly instead of inventing one (P-08, P-10)", () => {
    expect(() => taxonFixtureRows([["Ignotus planta", "x", "x", "Ignotaceae", "x"]])).toThrow(
      "Ignotaceae",
    );
  });

  it("US-QS-15 an empty tree gets the fixture: resolved cards with lineage only, every fetched value unknown", async () => {
    const c = await admin.connect();
    try {
      await c.query("begin");
      await c.query("delete from taxon");
      expect(await seedTaxonFixture(c)).toBe("written");
      const tree = await new TaxonomyPostgres(c as unknown as Pool).tree();
      expect(tree).toHaveLength(SEED_SPECIES.length);
      const monstera = tree.find((t) => t.latinName === "Monstera deliciosa");
      expect(monstera).toMatchObject({
        genus: "Monstera",
        family: "Araceae",
        order: "Alismatales",
      });
      expect(monstera).toMatchObject({ summary: null, imageUrl: null, genusSpeciesCount: null });
      expect(monstera?.natureRarity).toEqual({ iucn: null, occurrences: null });
      // The Sammlerkarten layer draws one card per tree row; every species Ben keeps has its row.
      expect(collectorCards(tree, [], [])).toHaveLength(SEED_SPECIES.length);
      const names = new Set(tree.map((t) => t.latinName));
      for (const plant of BEN_SPECIMENS) expect(names).toContain(plant.latin);
      const fp = await c.query<{ f: string; ott: string | null }>(
        "select catalog_fingerprint as f, ott_id as ott from taxon limit 1",
      );
      expect(fp.rows[0]).toEqual({ f: TAXON_FIXTURE_FINGERPRINT, ott: null });
    } finally {
      await c.query("rollback");
      c.release();
    }
  });

  it("US-QS-15 a tree that is already there, built or seeded, is kept", async () => {
    const c = await admin.connect();
    try {
      await c.query("begin");
      await c.query("delete from taxon");
      await seedTaxonFixture(c, SEED_SPECIES.slice(0, 1));
      expect(await seedTaxonFixture(c)).toBe("kept");
      expect((await c.query("select 1 from taxon")).rowCount).toBe(1);
    } finally {
      await c.query("rollback");
      c.release();
    }
  });
});
