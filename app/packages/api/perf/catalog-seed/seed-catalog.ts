import type { Pool, PoolClient } from "pg";
import { findOrCreateAccount } from "@pflanzendex/db";
import { normalize, parseLatin } from "@pflanzendex/core";
import type { SeedRow } from "./species-list.ts";

// Writes demo species as an operator batch (`curated`, FR-BES-11) on a superuser connection, which is the only way
// to create `created_by = 'operator'` rows outside the application. Every value that is not a plain name is a
// starting value and says so in `source` (P-08).
export const SEED_SOURCE =
  "Dev seed: names and family from common botanical knowledge, difficulty and light level are starting values";
const LUX_BY_LEVEL = { 2: 3000, 3: 8000, 4: 20000 } as const; // assumption, not measured

/** Inserts one species with its names and its `curated` review case (same transaction as the caller). */
async function insertSpecies(
  client: PoolClient,
  owner: string,
  [latin, german, english, famLatin, famGerman, difficulty, level]: SeedRow,
  parsed: NonNullable<ReturnType<typeof parseLatin>>,
): Promise<void> {
  const inserted = await client.query<{ id: string }>(
    `insert into species (created_by, latin_name, genus, epithet, german_name, english_name, family_latin,
       family_german, difficulty, standard_level, light_demand_lux, growth_measure, etiolation_signs,
       success_criteria, source)
     values ('operator', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'height', $11, $12, $13) returning id`,
    [
      parsed.display,
      parsed.genus,
      parsed.epithet,
      german,
      english,
      famLatin,
      famGerman,
      difficulty,
      level,
      LUX_BY_LEVEL[level],
      "Lange, helle Zwischenräume und blasse Triebe.",
      "Kompakter Neuaustrieb ohne Streckung.",
      SEED_SOURCE,
    ],
  );
  const id = inserted.rows[0]?.id;
  if (!id) throw new Error(`species not inserted: ${latin}`);
  await client.query(
    `insert into species_name (species_id, field, display, norm)
     select $1, * from unnest($2::text[], $3::text[], $4::text[])`,
    [
      id,
      ["latin", "german", "english"],
      [parsed.display, german, english],
      [latin, german, english].map(normalize),
    ],
  );
  await client.query(
    "insert into review_case (account_id, object_kind, object_id, status) values ($1, 'species', $2, 'curated')",
    [owner, id],
  );
}

/** Adds the species that are not in the catalog yet; returns how many it created and the account that owns them. */
export async function seedCatalog(
  pool: Pool,
  rows: readonly SeedRow[],
  subject = "catalog-seed",
): Promise<{ created: number; owner: string }> {
  const owner = await findOrCreateAccount(pool, subject);
  let created = 0;
  const client = await pool.connect();
  try {
    await client.query("begin");
    // species and review_case reference each other; the application path creates them in separate steps.
    await client.query("set local session_replication_role = replica");
    for (const row of rows) {
      const latin = row[0];
      const parsed = parseLatin(latin);
      if (!parsed) throw new Error(`not a species name: ${latin}`);
      const exists = await client.query(
        "select 1 from species_name where field = 'latin' and norm = $1",
        [normalize(latin)],
      );
      if (exists.rowCount) continue;
      await insertSpecies(client, owner, row, parsed);
      created++;
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
  return { created, owner };
}
