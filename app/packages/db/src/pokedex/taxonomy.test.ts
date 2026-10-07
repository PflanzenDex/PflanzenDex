import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrate, openOwnerPool, withAccount } from "../kernel/index.ts";
import { TaxonomyPostgres, type TaxonRecord, type TaxonomyRecord } from "./taxonomy.ts";

// US-POK-03, FR-POK-03: the taxonomy tree in real PostgreSQL (`make db-up`).
let pool: Pool;
let store: TaxonomyPostgres;
const provenance = {
  source: "opentree",
  url: "https://api.opentreeoflife.org/v3",
  retrievedAt: "2026-10-06T10:00:00Z",
};
const build = (fingerprint: string, extra: Partial<TaxonomyRecord> = {}): TaxonomyRecord => ({
  fingerprint,
  builtAt: "2026-10-06T10:00:00Z",
  taxa: [
    {
      latinName: "Ficus benjamina",
      lineage: {
        ottId: 1,
        acceptedName: "Ficus benjamina",
        genus: "Ficus",
        family: "Moraceae",
        order: "Rosales",
        provenance,
      },
      text: {
        language: "de",
        text: "Eine Art.",
        imageUrl: null,
        pageUrl: "https://de.wikipedia.org/wiki/Ficus_benjamina",
        provenance: { ...provenance, source: "wikipedia" },
      },
      genusSpeciesCount: null,
    },
  ],
  failures: [{ latinName: "Nonexistus plantus", reason: "taxonomy.no_match" }],
  ...extra,
});

beforeAll(async () => {
  pool = openOwnerPool();
  await migrate(pool);
  store = new TaxonomyPostgres(pool);
});
beforeEach(async () => {
  await pool.query("delete from taxon");
});
afterAll(async () => {
  await pool.query("delete from taxon");
  await pool.end();
});

describe("US-POK-03 taxonomy tree in the database", () => {
  it("US-POK-03 stores resolved species with their sources and failures with their reason", async () => {
    expect(await store.fingerprint()).toBeNull();
    await store.replace(build("f1"));
    expect(await store.fingerprint()).toBe("f1");
    const r = await pool.query("select * from taxon order by latin_name");
    expect(r.rows[0]).toMatchObject({
      latin_name: "Ficus benjamina",
      status: "resolved",
      family: "Moraceae",
      order_name: "Rosales",
      genus_species_count: null,
    });
    expect(r.rows[0].provenance).toMatchObject({
      lineage: { source: "opentree" },
      text: { source: "wikipedia" },
    });
    expect(r.rows[1]).toMatchObject({
      latin_name: "Nonexistus plantus",
      status: "unresolved",
      failure_code: "taxonomy.no_match",
      genus: null,
    });
  });

  it("US-POK-03 replaces the whole tree atomically: a failing replacement keeps the previous tree", async () => {
    await store.replace(build("f1"));
    const [first] = build("x").taxa;
    const bad = {
      ...(first as TaxonRecord),
      genusSpeciesCount: { value: 0, provenance },
    };
    const broken = build("f2", { taxa: [bad] });
    await expect(store.replace(broken)).rejects.toThrow();
    expect(await store.fingerprint()).toBe("f1");
    expect((await pool.query("select count(*)::int as n from taxon")).rows[0].n).toBe(2);
  });

  it("US-POK-03 FR-POK-03 the application role may read the tree but never write it", async () => {
    await store.replace(build("f1"));
    const account = randomUUID();
    await withAccount(pool, account, (c) =>
      c.query("insert into account (id) values ($1)", [account]),
    );
    const read = await withAccount(pool, account, (c) => c.query("select 1 from taxon"));
    expect(read.rowCount).toBe(2);
    await expect(
      withAccount(pool, account, (c) => c.query("update taxon set family = 'Hand'")),
    ).rejects.toThrow(/permission denied/);
    await expect(withAccount(pool, account, (c) => c.query("delete from taxon"))).rejects.toThrow(
      /permission denied/,
    );
  });

  it("US-POK-01 reads the resolved tree for the cards, never the unresolved rows", async () => {
    await store.replace(build("f1"));
    expect(await store.tree()).toEqual([
      {
        latinName: "Ficus benjamina",
        genus: "Ficus",
        family: "Moraceae",
        order: "Rosales",
        summary: "Eine Art.",
        imageUrl: null,
        pageUrl: "https://de.wikipedia.org/wiki/Ficus_benjamina",
        genusSpeciesCount: null,
      },
    ]);
  });
});
