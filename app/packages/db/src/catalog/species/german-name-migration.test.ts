import { randomUUID } from "node:crypto";
import { copyFileSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
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

// US-BES-12, FR-BES-17 (issue 1851): migration 0119 applies the new rank of the German name (the German article before
// the Wikidata label) to the names the fill job has stored. A scratch database is migrated up to 0118, filled with
// species, their stored snapshots and the provenance of their German name, then migrated to the end.
const MIGRATION = "0119";
// Folders this file makes are removed after it, also when a test fails (#1278).
const madeDirs: string[] = [];
function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  madeDirs.push(dir);
  return dir;
}

const DB = `german_name_${randomUUID()
  .replace(/[0-9-]/g, "")
  .slice(0, 8)}`;
let admin: pg.Pool;
let scratch: pg.Pool;

const uid = (n: number) => `e2000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const DE_PAGE = "https://de.wikipedia.org/wiki/Gefleckte_Efeutute";

type Case = {
  id: string;
  latin: string;
  name: string;
  origin: "source" | "reviewer";
  source: "wikidata" | null;
  disputed: boolean;
  page: string;
};
const CASES = {
  wrong: {
    id: uid(1),
    latin: "Scindapsus pictus",
    name: "Krötenzwergmaus",
    origin: "source",
    source: "wikidata",
    disputed: true,
    page: DE_PAGE,
  },
  reviewed: {
    id: uid(2),
    latin: "Scindapsus aureus",
    name: "Krötenzwergmaus",
    origin: "reviewer",
    source: null,
    disputed: false,
    page: DE_PAGE,
  },
  agreed: {
    id: uid(3),
    latin: "Scindapsus treubii",
    name: "Krötenzwergmaus",
    origin: "source",
    source: "wikidata",
    disputed: false,
    page: DE_PAGE,
  },
  english: {
    id: uid(4),
    latin: "Scindapsus hederaceus",
    name: "Krötenzwergmaus",
    origin: "source",
    source: "wikidata",
    disputed: true,
    page: "https://en.wikipedia.org/wiki/Scindapsus",
  },
} satisfies Record<string, Case>;

async function seed(db: pg.Pool) {
  const c = await db.connect();
  try {
    await c.query("begin");
    // The fixture writes species without the triggers of the review copy; the rows are plain catalog data here.
    await c.query("set local session_replication_role = replica");
    for (const k of Object.values(CASES) as Case[]) {
      const [genus = "", epithet = ""] = k.latin.split(" ");
      await c.query(
        `insert into species (id, created_by, latin_name, genus, epithet, german_name, growth_measure,
           etiolation_signs, success_criteria, source, version)
         values ($1, 'operator', $2, $3, $4, $5, 'height', 'x', 'y', 'fixture', 2)`,
        [k.id, k.latin, genus, epithet, k.name],
      );
      await c.query(
        `insert into catalog_source_snapshot (species_id, source, source_id, retrieved_at, link, license, raw)
         values ($1, 'wikipedia', 'Q9334559', '2026-11-01T08:00:00Z', $2, 'CC-BY-SA-4.0', $3)`,
        [
          k.id,
          k.page,
          { title: "Gefleckte Efeutute", content_urls: { desktop: { page: k.page } } },
        ],
      );
      await c.query(
        `insert into catalog_field_provenance
           (species_id, field, version, value, origin, source, link, license, retrieved_on, disputed)
         values ($1, 'german_name', 2, $2, $3, $4, $5, $6, $7, $8)`,
        [
          k.id,
          k.name,
          k.origin,
          k.source,
          k.source ? "https://www.wikidata.org/wiki/Q9334559" : null,
          k.source ? "CC0-1.0" : null,
          k.source ? "2026-11-01" : null,
          k.disputed,
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

async function nameOf(id: string) {
  const r = await scratch.query<{ german_name: string | null; version: number }>(
    "select german_name, version from species where id = $1",
    [id],
  );
  return r.rows[0];
}

async function newestProvenance(id: string) {
  const r = await scratch.query<{
    value: string;
    source: string | null;
    version: number;
    disputed: boolean;
  }>(
    `select value, source, version, disputed from catalog_field_provenance
      where species_id = $1 and field = 'german_name' order by version desc limit 1`,
    [id],
  );
  return r.rows[0];
}

beforeAll(async () => {
  admin = openAdminPool();
  await admin.query(`create database ${DB}`);
  const url = new URL(testDatabaseUrl());
  url.pathname = `/${DB}`;
  scratch = openPool(url.toString());
  scratch.on("error", () => undefined);
  const before = tempDir("german-name-");
  for (const f of readdirSync(MIGRATIONS_DIRECTORY).filter((n) => n < MIGRATION))
    copyFileSync(join(MIGRATIONS_DIRECTORY, f), join(before, f));
  await migrate(scratch, { directory: before });
  await seed(scratch);
  await migrate(scratch);
}, 120_000);

afterAll(async () => {
  for (const dir of madeDirs) rmSync(dir, { recursive: true, force: true });
  await scratch.end();
  await admin.query(`drop database if exists ${DB} with (force)`);
  await admin.end();
});

describe("US-BES-12 migration 0119: the German name from the German article (issue 1851)", () => {
  it("US-BES-12: Given a disputed Wikidata label and a German article, when migrated, then the name is the article title with its own provenance", async () => {
    expect(await nameOf(CASES.wrong.id)).toEqual({ german_name: "Gefleckte Efeutute", version: 3 });
    expect(await newestProvenance(CASES.wrong.id)).toEqual({
      value: "Gefleckte Efeutute",
      source: "wikipedia",
      version: 3,
      disputed: true,
    });
  });

  it("US-BES-12: Given a name a reviewer set, when migrated, then it stays", async () => {
    expect(await nameOf(CASES.reviewed.id)).toEqual({ german_name: "Krötenzwergmaus", version: 2 });
  });

  it("US-BES-12: Given a Wikidata label that was not disputed, when migrated, then it stays", async () => {
    expect(await nameOf(CASES.agreed.id)).toEqual({ german_name: "Krötenzwergmaus", version: 2 });
  });

  it("US-BES-12: Given only an English article, when migrated, then the name stays", async () => {
    expect(await nameOf(CASES.english.id)).toEqual({ german_name: "Krötenzwergmaus", version: 2 });
  });
});
