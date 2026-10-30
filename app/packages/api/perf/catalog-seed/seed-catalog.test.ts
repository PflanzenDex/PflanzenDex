import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openFixturePool, openOwnerPool } from "@pflanzendex/db";
import { seedCatalog, SEED_SOURCE } from "./seed-catalog.ts";
import type { SeedRow } from "./species-list.ts";

// Dev seed for the catalog (US-BES-12, operator batch): visible to everybody as `curated`, idempotent, without invented
// difficulty or light need (P-08). Real PostgreSQL (`make db-up`); the test seeds two species with names of its own.
let admin: Pool;
let pool: Pool; // owner connection: migrations run as the owner, like in production
let owner: string | undefined;
const letters = randomUUID()
  .replace(/[0-9]/g, (z) => "ghijklmnop"[Number(z)] ?? "x")
  .replace(/-/g, "")
  .slice(0, 10);
const rows: readonly SeedRow[] = [
  [
    `Seedgenus ${letters}`,
    `Seedart ${letters}`,
    `Seed plant ${letters}`,
    "Araceae",
    "Aronstabgewächse",
  ],
  [
    `Seedgenus ${letters}altus`,
    `Seedhoch ${letters}`,
    `Seed tall ${letters}`,
    "Araceae",
    "Aronstabgewächse",
  ],
];

// Species and review case point at each other, so the species go with the foreign keys off (tests only).
async function removeSeedOf(account: string): Promise<void> {
  const c = await admin.connect();
  try {
    await c.query("begin");
    await c.query("set local session_replication_role = replica");
    await c.query(
      "delete from species where id in (select object_id from review_case where account_id = $1)",
      [account],
    );
    await c.query("delete from review_case where account_id = $1", [account]);
    await c.query("set local session_replication_role = default");
    await c.query("delete from account where id = $1", [account]);
    await c.query("commit");
  } catch (error) {
    await c.query("rollback");
    throw error;
  } finally {
    c.release();
  }
}

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
});
afterAll(async () => {
  if (owner) await removeSeedOf(owner);
  await admin.end();
  await pool.end();
});

describe("US-BES-12 dev seed of the catalog", () => {
  it("US-BES-12: Given a species list, when it is seeded, then every species is curated with its names, its source and an unknown light need (P-08)", async () => {
    const first = await seedCatalog(admin, rows, `seed-test-${letters}`);
    owner = first.owner;
    expect(first.created).toBe(rows.length);
    const r = await admin.query<{
      status: string;
      source: string;
      created_by: string;
      names: number;
      difficulty: number | null;
      standard_level: number | null;
      light_demand_lux: number | null;
      growth_measure: string | null;
      etiolation_signs: string | null;
      success_criteria: string | null;
    }>(
      `select v.status, s.source, s.created_by, (select count(*)::int from species_name n where n.species_id = s.id) as names,
              s.difficulty, s.standard_level, s.light_demand_lux, s.growth_measure, s.etiolation_signs,
              s.success_criteria
         from species s join review_case v on v.object_kind = 'species' and v.object_id = s.id
        where s.german_name = $1`,
      [rows[0]?.[1]],
    );
    expect(r.rows).toEqual([
      {
        status: "curated",
        source: SEED_SOURCE,
        created_by: "operator",
        names: 3,
        difficulty: null,
        standard_level: null,
        light_demand_lux: null,
        // #1005: no generic care texts and no guessed growth measure either (P-08).
        growth_measure: null,
        etiolation_signs: null,
        success_criteria: null,
      },
    ]);
  });

  it("US-BES-12: Given a seeded catalog, when the seed runs again, then nothing is added twice", async () => {
    const again = await seedCatalog(admin, rows, `seed-test-${letters}`);
    expect(again.created).toBe(0);
  });
});

describe("seed source text (US-QS-24)", () => {
  it("US-QS-24 the source shown to users is German, not English", () => {
    expect(SEED_SOURCE).toMatch(/^Dev-Seed: Namen und Familie/);
    expect(SEED_SOURCE).not.toMatch(/\bnames and family\b/);
  });
});
