import type { Pool, PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { collectorCards } from "@pflanzendex/core";
import { holdTaxonLock, migrate, openFixturePool, TaxonomyPostgres } from "@pflanzendex/db";
import { BEN_SPECIMENS } from "../demo-seed/accounts/ben/ben-plants.ts";
import { SEED_SPECIES } from "./species-list.ts";
import {
  replaceTaxonWithFixture,
  seedTaxonFixture,
  taxonFixtureRows,
  TAXON_COLUMNS,
  TAXON_FIXTURE_FINGERPRINT,
} from "./taxon-fixture.ts";

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

// A tree as the taxonomy build writes it (issue 2488): other fingerprint, a summary, an OpenTree id and a researched
// attribute. The local one-screen run measured such a tree; CI never has one.
const BUILD_FINGERPRINT = "build-2488";
async function writeBuiltTree(c: PoolClient): Promise<void> {
  await c.query("delete from taxon");
  await c.query("delete from taxon_attribute");
  await c.query(
    `insert into taxon (latin_name, status, accepted_name, genus, family, order_name, ott_id, summary, summary_language,
       provenance, catalog_fingerprint, built_at)
     values ('Monstera deliciosa', 'resolved', 'Monstera deliciosa', 'Monstera', 'Araceae', 'Alismatales', 4242,
       'A long Wikipedia summary of the built tree.', 'en', '{}', $1, '2026-11-10T00:00:00Z'),
       ('Pachira aquatica', 'resolved', 'Pachira aquatica', 'Pachira', 'Malvaceae', 'Malvales', null, null, null, '{}', $1,
       '2026-11-10T00:00:00Z')`,
    [BUILD_FINGERPRINT],
  );
  await c.query(
    `insert into taxon_attribute (latin_name, field, value, source, source_url, license, retrieved_on)
     values ('Pachira aquatica', 'humidity', '"high"', 'gbif', 'https://api.gbif.org/v1/species/2488', 'CC0-1.0', '2026-11-10')`,
  );
}

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

  it("US-QS-15 seedTaxonFixture still keeps a real built tree with its other names and fingerprint (issue 2488)", async () => {
    const c = await admin.connect();
    try {
      await c.query("begin");
      await writeBuiltTree(c);
      expect(await seedTaxonFixture(c)).toBe("kept");
      const kept = await c.query<{ n: number; f: string }>(
        "select count(*)::int as n, min(catalog_fingerprint) as f from taxon",
      );
      expect(kept.rows[0]).toEqual({ n: 2, f: BUILD_FINGERPRINT });
    } finally {
      await c.query("rollback");
      c.release();
    }
  });

  it("US-QS-15 a built tree is replaced by the fixture CI uses: its rows and researched attributes go (issue 2488)", async () => {
    const c = await admin.connect();
    try {
      await c.query("begin");
      await writeBuiltTree(c);
      expect(await replaceTaxonWithFixture(c)).toBe("written");
      const tree = await new TaxonomyPostgres(c as unknown as Pool).tree();
      expect(tree).toHaveLength(SEED_SPECIES.length);
      expect(tree.find((t) => t.latinName === "Monstera deliciosa")).toMatchObject({
        summary: null,
        imageUrl: null,
        genusSpeciesCount: null,
      });
      expect(tree.find((t) => t.latinName === "Pachira aquatica")).toBeUndefined();
      const other = await c.query("select 1 from taxon where catalog_fingerprint <> $1", [
        TAXON_FIXTURE_FINGERPRINT,
      ]);
      expect(other.rowCount).toBe(0);
      const attributes = await c.query("select 1 from taxon_attribute where latin_name = $1", [
        "Pachira aquatica",
      ]);
      expect(attributes.rowCount).toBe(0);
    } finally {
      await c.query("rollback");
      c.release();
    }
  });

  it("US-QS-15 a second run finds the fixture and keeps it (issue 2488)", async () => {
    const c = await admin.connect();
    try {
      await c.query("begin");
      await writeBuiltTree(c);
      expect(await replaceTaxonWithFixture(c)).toBe("written");
      expect(await replaceTaxonWithFixture(c)).toBe("kept");
      expect((await c.query("select 1 from taxon")).rowCount).toBe(SEED_SPECIES.length);
    } finally {
      await c.query("rollback");
      c.release();
    }
  });

  it("US-QS-15 a fixture row whose value differs is replaced, so the table is exactly the fixture (issue 2488)", async () => {
    const c = await admin.connect();
    try {
      await c.query("begin");
      await c.query("delete from taxon");
      expect(await seedTaxonFixture(c)).toBe("written");
      await c.query(
        "update taxon set summary = 'Hand-written text.', summary_language = 'en' where latin_name = 'Monstera deliciosa'",
      );
      expect(await replaceTaxonWithFixture(c)).toBe("written");
      const summary = await c.query<{ s: string | null }>(
        "select summary as s from taxon where latin_name = 'Monstera deliciosa'",
      );
      expect(summary.rows[0]).toEqual({ s: null });
    } finally {
      await c.query("rollback");
      c.release();
    }
  });

  it("US-QS-15 a fixture tree with a leftover researched attribute is not kept: the attribute goes too (issue 2488)", async () => {
    const c = await admin.connect();
    try {
      await c.query("begin");
      await c.query("delete from taxon");
      expect(await seedTaxonFixture(c)).toBe("written");
      await c.query(
        `insert into taxon_attribute (latin_name, field, value, source, source_url, license, retrieved_on)
         values ('Monstera deliciosa', 'humidity', '"high"', 'gbif', 'https://api.gbif.org/v1/species/2488', 'CC0-1.0', '2026-11-10')`,
      );
      expect(await replaceTaxonWithFixture(c)).toBe("written");
      const attributes = await c.query("select 1 from taxon_attribute where latin_name = $1", [
        "Monstera deliciosa",
      ]);
      expect(attributes.rowCount).toBe(0);
    } finally {
      await c.query("rollback");
      c.release();
    }
  });

  it("US-QS-15 the fixture compares every column of taxon, so a new column cannot slip past it (issue 2488)", async () => {
    const columns = await admin.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'taxon'",
    );
    expect(columns.rows.map((r) => r.column_name).sort()).toEqual([...TAXON_COLUMNS].sort());
  });
});
