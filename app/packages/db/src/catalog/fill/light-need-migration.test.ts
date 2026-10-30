import { randomUUID } from "node:crypto";
import { copyFileSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  migrate,
  MIGRATIONS_DIRECTORY,
  openAdminPool,
  openPool,
  testDatabaseUrl,
} from "../../kernel/index.ts";

// US-BES-12, US-LIC-01 (#1003): migration 0095 makes difficulty, default level and lux need nullable and clears the
// starting values the operator batch and the dev seed wrote (P-08). A scratch database is migrated up to 0094, filled
// with starting-value rows and with rows a reviewer confirmed or changed, then migrated to the end.
const MIGRATION = "0095";
const START_OLD =
  "Curated start catalog (operator): names and family are taxonomic facts, entered by the operator; difficulty and standard light level are starting values, not measured and not cited";
const SEED_OLD =
  "Dev seed: names and family from common botanical knowledge, difficulty and light level are starting values";
const DB = `light_need_${randomUUID()
  .replace(/[0-9-]/g, "")
  .slice(0, 8)}`;
let admin: pg.Pool;
let scratch: pg.Pool;

const uid = (n: number) => `e0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const OPERATOR = uid(100);
const REVIEWER = uid(101);

type Row = {
  id: string;
  source: string;
  status: "curated" | "reviewed" | "proposal";
  version?: number;
};
const ROWS = {
  start: { id: uid(1), source: START_OLD, status: "curated" },
  seed: { id: uid(2), source: SEED_OLD, status: "curated" },
  reviewed: { id: uid(3), source: START_OLD, status: "reviewed" },
  changed: { id: uid(4), source: START_OLD, status: "curated", version: 2 },
  cited: { id: uid(5), source: "Hessayon, The House Plant Expert, p. 12", status: "curated" },
  proposal: { id: uid(6), source: START_OLD, status: "proposal" },
} satisfies Record<string, Row>;

async function seed(db: pg.Pool) {
  await db.query(
    "insert into account (id, subject) values ($1, 'ln-operator'), ($2, 'ln-reviewer')",
    [OPERATOR, REVIEWER],
  );
  const c = await db.connect();
  try {
    await c.query("begin");
    // species and review_case point at each other; the fixture writes both with the foreign keys off.
    await c.query("set local session_replication_role = replica");
    for (const [i, r] of (Object.values(ROWS) as Row[]).entries()) {
      await c.query(
        `insert into species (id, created_by, latin_name, genus, epithet, difficulty, standard_level, light_demand_lux,
           growth_measure, etiolation_signs, success_criteria, source, version)
         values ($1, 'operator', $2, 'Lightneed', $3, 2, 3, 8000, 'height', 'x', 'y', $4, $5)`,
        [r.id, `Lightneed spec${"abcdef"[i]}`, `spec${"abcdef"[i]}`, r.source, r.version ?? 1],
      );
      await c.query(
        `insert into review_case (account_id, object_kind, object_id, status, reviewed_by, reviewed_at)
         values ($1, 'species', $2, $3, $4, $5)`,
        [
          OPERATOR,
          r.id,
          r.status,
          r.status === "reviewed" ? REVIEWER : null,
          r.status === "reviewed" ? new Date() : null,
        ],
      );
    }
    await c.query("commit");
  } catch (error) {
    await c.query("rollback");
    throw error;
  } finally {
    c.release();
  }
}

async function values(id: string) {
  const r = await scratch.query<{
    difficulty: number | null;
    standard_level: number | null;
    light_demand_lux: number | null;
    source: string;
  }>("select difficulty, standard_level, light_demand_lux, source from species where id = $1", [
    id,
  ]);
  return r.rows[0];
}

beforeAll(async () => {
  admin = openAdminPool();
  await admin.query(`create database ${DB}`);
  const url = new URL(testDatabaseUrl());
  url.pathname = `/${DB}`;
  scratch = openPool(url.toString());
  scratch.on("error", () => undefined);
  const before = mkdtempSync(join(tmpdir(), "light-need-"));
  for (const f of readdirSync(MIGRATIONS_DIRECTORY).filter((n) => n < MIGRATION))
    copyFileSync(join(MIGRATIONS_DIRECTORY, f), join(before, f));
  await migrate(scratch, { directory: before });
  await seed(scratch);
  await migrate(scratch);
}, 120_000);
afterAll(async () => {
  await scratch.end();
  await admin.query(`drop database if exists ${DB} with (force)`);
  await admin.end();
});

const UNKNOWN = { difficulty: null, standard_level: null, light_demand_lux: null };
const KEPT = { difficulty: 2, standard_level: 3, light_demand_lux: 8000 };

describe("US-BES-12 migration 0095: starting values become unknown (P-08, #1003)", () => {
  it("US-BES-12: Given a species loaded by catalog:load with starting values, when migrated, then difficulty, level and lux are unknown and the source says so", async () => {
    expect(await values(ROWS.start.id)).toEqual({
      ...UNKNOWN,
      source:
        "Curated start catalog (operator): names and family are taxonomic facts, entered by the operator; difficulty and light need unknown until a source is given",
    });
  });

  it("US-BES-12: Given a species of the dev seed with starting values, when migrated, then its values are unknown", async () => {
    expect(await values(ROWS.seed.id)).toEqual({
      ...UNKNOWN,
      source:
        "Dev seed: names and family from common botanical knowledge; difficulty and light need unknown",
    });
  });

  it("US-BES-12: Given a reviewed, a changed, a cited and a proposed species, when migrated, then their values stay", async () => {
    for (const key of ["reviewed", "changed", "cited", "proposal"] as const)
      expect(await values(ROWS[key].id), key).toMatchObject({
        ...KEPT,
        source: ROWS[key].source,
      });
  });

  it("US-LIC-01: Given the migrated schema, then a species may store an unknown light need, and the range checks still hold", async () => {
    await expect(
      scratch.query("update species set light_demand_lux = 0 where id = $1", [ROWS.cited.id]),
    ).rejects.toThrow(/species_light_demand_lux_check/);
    await scratch.query(
      "update species set difficulty = null, standard_level = null, light_demand_lux = null where id = $1",
      [ROWS.cited.id],
    );
    expect(await values(ROWS.cited.id)).toMatchObject(UNKNOWN);
  });
});
