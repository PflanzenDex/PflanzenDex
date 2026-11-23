import type { Pool, PoolClient } from "pg";
import { parseLatin } from "@pflanzendex/core";
import { SEED_SPECIES, type SeedRow } from "./species-list.ts";

// A Pokédex tree for the demo species without foreign servers (issue 1164): the one-screen gate runs with
// `TAXONOMY_BUILD=off`, so without it the collector cards were measured empty. Genus and family come from the seed list,
// the order of each family from APG IV (flowering plants), PPG I (ferns) and the cycad order. Everything a build would
// fetch (OpenTree id, Wikipedia text and image, GBIF counts, IUCN category) stays NULL, so nothing is invented (P-08).
export const ORDER_OF_FAMILY: Readonly<Record<string, string>> = {
  Apocynaceae: "Gentianales",
  Araceae: "Alismatales",
  Araliaceae: "Apiales",
  Arecaceae: "Arecales",
  Asparagaceae: "Asparagales",
  Asphodelaceae: "Asparagales",
  Aspleniaceae: "Polypodiales",
  Begoniaceae: "Cucurbitales",
  Bromeliaceae: "Poales",
  Commelinaceae: "Commelinales",
  Crassulaceae: "Saxifragales",
  Cycadaceae: "Cycadales",
  Euphorbiaceae: "Malpighiales",
  Gesneriaceae: "Lamiales",
  Lomariopsidaceae: "Polypodiales",
  Marantaceae: "Zingiberales",
  Moraceae: "Rosales",
  Orchidaceae: "Asparagales",
  Piperaceae: "Piperales",
  Polypodiaceae: "Polypodiales",
  Pteridaceae: "Polypodiales",
  Rutaceae: "Sapindales",
  Urticaceae: "Rosales",
};

/** Not the fingerprint of any catalog: with `TAXONOMY_BUILD` on, the next check replaces the fixture by a real build. */
export const TAXON_FIXTURE_FINGERPRINT = "demo-seed-fixture";
const BUILT_AT = "2026-11-03T00:00:00.000Z";
// The source name can show beside the lineage, so it is German like `SEED_SOURCE` (US-QS-24).
const LINEAGE_SOURCE = {
  source: "Demo-Seed: Gattung und Familie aus der Seed-Liste, Ordnung nach APG IV und PPG I",
  url: "http://www.mobot.org/MOBOT/research/APweb/",
  retrievedAt: BUILT_AT,
};

export interface TaxonFixtureRow {
  readonly latinName: string;
  readonly genus: string;
  readonly family: string;
  readonly order: string;
}

/** The resolved rows for the seed list: the name as the catalog writes it, its genus, family and order. */
export function taxonFixtureRows(rows: readonly SeedRow[] = SEED_SPECIES): TaxonFixtureRow[] {
  return rows.map(([latin, , , family]) => {
    const parsed = parseLatin(latin);
    const order = ORDER_OF_FAMILY[family];
    if (!parsed || !order)
      throw new Error(`taxon fixture: no genus or order for ${latin} (${family})`);
    return { latinName: parsed.display, genus: parsed.genus, family, order };
  });
}

const INSERT = `insert into taxon (latin_name, status, accepted_name, genus, family, order_name, provenance,
    catalog_fingerprint, built_at)
  select name, 'resolved', name, genus, family, order_name, $5::jsonb, $6, $7
  from unnest($1::text[], $2::text[], $3::text[], $4::text[]) as t(name, genus, family, order_name)`;

/**
 * Writes the fixture tree into an empty `taxon` table (owner or superuser connection; the application role may only
 * read it). A table that already holds a tree, built or seeded, is left alone, so a real build is never overwritten.
 */
export async function seedTaxonFixture(
  db: Pool | PoolClient,
  rows: readonly SeedRow[] = SEED_SPECIES,
): Promise<"written" | "kept"> {
  const existing = await db.query<{ n: number }>("select count(*)::int as n from taxon");
  if ((existing.rows[0]?.n ?? 0) > 0) return "kept";
  const taxa = taxonFixtureRows(rows);
  await db.query(INSERT, [
    taxa.map((t) => t.latinName),
    taxa.map((t) => t.genus),
    taxa.map((t) => t.family),
    taxa.map((t) => t.order),
    JSON.stringify({ lineage: LINEAGE_SOURCE }),
    TAXON_FIXTURE_FINGERPRINT,
    BUILT_AT,
  ]);
  return "written";
}

/**
 * Every column of `taxon` (migrations 0025 and 0066). The fixture sets nine of them and leaves the rest NULL. A test
 * checks this list against the table, so a new column cannot slip past the comparison of `replaceTaxonWithFixture`.
 */
export const TAXON_COLUMNS = [
  "latin_name",
  "status",
  "failure_code",
  "accepted_name",
  "genus",
  "family",
  "order_name",
  "ott_id",
  "summary",
  "summary_language",
  "image_url",
  "page_url",
  "genus_species_count",
  "nature_iucn_category",
  "nature_gbif_occurrences",
  "provenance",
  "catalog_fingerprint",
  "built_at",
] as const;

const COLUMNS = TAXON_COLUMNS.join(", ");
// The fixture row of each seed name, in the order of TAXON_COLUMNS: the nine values it sets, NULL for the others.
const FIXTURE_ROWS = `select name, 'resolved', null::text, name, genus, family, order_name, null::bigint, null::text,
    null::text, null::text, null::text, null::integer, null::text, null::bigint, $5::jsonb, $6::text, $7::timestamptz
  from unnest($1::text[], $2::text[], $3::text[], $4::text[]) as t(name, genus, family, order_name)`;
// True when `taxon` holds exactly the fixture rows (no extra, missing or differing row) and no researched attribute.
const IS_FIXTURE = `select not exists (
    select from ((select ${COLUMNS} from taxon except ${FIXTURE_ROWS})
      union all (${FIXTURE_ROWS} except select ${COLUMNS} from taxon)) as differing
  ) and not exists (select from taxon_attribute) as same`;

/** Runs `work` in one transaction: its own on a pool, the caller's on a client (a test rolls back its own). */
async function atomically<T>(
  db: Pool | PoolClient,
  work: (c: Pool | PoolClient) => Promise<T>,
): Promise<T> {
  if ("release" in db) return work(db);
  const client = await db.connect();
  try {
    await client.query("begin");
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Makes `taxon` hold exactly the fixture (issue 2488). A local `make one-screen` run measured a worktree database that
 * held a real build with other content, so the overflow showed only locally. Any other tree goes, and so do its
 * researched attributes (`taxon_attribute`: no build writes them, and the seed writes none, so CI's table is empty at
 * this point). Returns "kept" when both tables already are exactly the fixture. Same connections as `seedTaxonFixture`,
 * and a worktree or test database only (the seed guard). One transaction: a failure keeps the previous tree.
 */
export async function replaceTaxonWithFixture(
  db: Pool | PoolClient,
  rows: readonly SeedRow[] = SEED_SPECIES,
): Promise<"written" | "kept"> {
  const taxa = taxonFixtureRows(rows);
  const params = [
    taxa.map((t) => t.latinName),
    taxa.map((t) => t.genus),
    taxa.map((t) => t.family),
    taxa.map((t) => t.order),
    JSON.stringify({ lineage: LINEAGE_SOURCE }),
    TAXON_FIXTURE_FINGERPRINT,
    BUILT_AT,
  ];
  return atomically(db, async (c) => {
    const same = await c.query<{ same: boolean }>(IS_FIXTURE, params);
    if (same.rows[0]?.same) return "kept";
    await c.query("delete from taxon_attribute");
    await c.query("delete from taxon");
    await c.query(INSERT, params);
    return "written";
  });
}
