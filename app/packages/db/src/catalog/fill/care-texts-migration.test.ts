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

// US-BES-12 (#1005): migration 0096 makes growth measure, etiolation signs and success criteria nullable and clears the
// generic texts the operator batch and the dev seed wrote for every species (P-08). A scratch database is migrated up to
// 0095, filled with such rows and with rows a reviewer confirmed, changed or wrote by hand, then migrated to the end.
const MIGRATION = "0096";
const START =
  "Curated start catalog (operator): names and family are taxonomic facts, entered by the operator; difficulty and light need unknown until a source is given";
const SEED =
  "Dev seed: names and family from common botanical knowledge; difficulty and light need unknown";
const SIGNS = "Lange, helle Zwischenräume und blasse Triebe.";
const SUCCESS = "Kompakter Neuaustrieb ohne Streckung.";
const DB = `care_texts_${randomUUID()
  .replace(/[0-9-]/g, "")
  .slice(0, 8)}`;
let admin: pg.Pool;
let scratch: pg.Pool;

const uid = (n: number) => `e1000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const OPERATOR = uid(100);
const REVIEWER = uid(101);

type Row = {
  id: string;
  source: string;
  status: "curated" | "reviewed" | "proposal";
  version?: number;
  signs?: string;
};
const ROWS = {
  start: { id: uid(1), source: START, status: "curated" },
  seed: { id: uid(2), source: SEED, status: "curated" },
  reviewed: { id: uid(3), source: START, status: "reviewed" },
  changed: { id: uid(4), source: START, status: "curated", version: 2 },
  own: { id: uid(5), source: START, status: "curated", signs: "Blattstiele werden lang." },
  proposal: { id: uid(6), source: START, status: "proposal" },
} satisfies Record<string, Row>;

async function seed(db: pg.Pool) {
  await db.query(
    "insert into account (id, subject) values ($1, 'ct-operator'), ($2, 'ct-reviewer')",
    [OPERATOR, REVIEWER],
  );
  const c = await db.connect();
  try {
    await c.query("begin");
    // species and review_case point at each other; the fixture writes both with the foreign keys off.
    await c.query("set local session_replication_role = replica");
    for (const [i, r] of (Object.values(ROWS) as Row[]).entries()) {
      await c.query(
        `insert into species (id, created_by, latin_name, genus, epithet, growth_measure, etiolation_signs,
           success_criteria, source, version)
         values ($1, 'operator', $2, 'Caretext', $3, 'height', $4, $5, $6, $7)`,
        [
          r.id,
          `Caretext spec${"abcdef"[i]}`,
          `spec${"abcdef"[i]}`,
          r.signs ?? SIGNS,
          SUCCESS,
          r.source,
          r.version ?? 1,
        ],
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

async function texts(id: string) {
  const r = await scratch.query<{
    growth_measure: string | null;
    etiolation_signs: string | null;
    success_criteria: string | null;
  }>("select growth_measure, etiolation_signs, success_criteria from species where id = $1", [id]);
  return r.rows[0];
}

beforeAll(async () => {
  admin = openAdminPool();
  await admin.query(`create database ${DB}`);
  const url = new URL(testDatabaseUrl());
  url.pathname = `/${DB}`;
  scratch = openPool(url.toString());
  scratch.on("error", () => undefined);
  const before = mkdtempSync(join(tmpdir(), "care-texts-"));
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

const UNKNOWN = { growth_measure: null, etiolation_signs: null, success_criteria: null };

describe("US-BES-12 migration 0096: generic care texts become unknown (P-08, #1005)", () => {
  it("US-BES-12: Given species of catalog:load and of the dev seed with the generic texts, when migrated, then growth measure, etiolation signs and success criteria are unknown", async () => {
    expect(await texts(ROWS.start.id)).toEqual(UNKNOWN);
    expect(await texts(ROWS.seed.id)).toEqual(UNKNOWN);
  });

  it("US-BES-12: Given a reviewed, a changed, a hand-written and a proposed species, when migrated, then their values stay", async () => {
    for (const key of ["reviewed", "changed", "own", "proposal"] as const)
      expect(await texts(ROWS[key].id), key).toMatchObject({
        growth_measure: "height",
        success_criteria: SUCCESS,
      });
    expect((await texts(ROWS.own.id))?.etiolation_signs).toBe("Blattstiele werden lang.");
  });

  it("US-BES-12: Given the migrated schema, then the growth measure check still holds for a known value", async () => {
    await expect(
      scratch.query("update species set growth_measure = 'width' where id = $1", [ROWS.own.id]),
    ).rejects.toThrow(/species_growth_measure_check/);
  });
});
