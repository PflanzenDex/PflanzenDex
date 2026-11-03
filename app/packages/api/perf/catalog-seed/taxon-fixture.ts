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
