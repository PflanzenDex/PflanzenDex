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
  withAccount,
} from "./kernel/index.ts";

// US-DEV-07: every migration runs on a database with realistic data. A scratch database is migrated up to 0012 (the
// English names, ADR 0004), filled with a data set of the order of magnitude of the prototype (13 species, 17
// specimens, measurement series; a fixture, no import), then migrated to the end. Every later migration, also every
// future one, therefore runs over this data, and the test proves that nothing is lost and the tenants stay apart.
const BASELINE = "0013"; // files before this name form the state the fixture is written for
const DB = `realistic_${randomUUID()
  .replace(/[0-9-]/g, "")
  .slice(0, 8)}`;
let admin: pg.Pool;
let scratch: pg.Pool;
let applied: string[] = [];

/** Deterministic ids, so failures name the same row on every run. */
const uid = (prefix: string, n: number) =>
  `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ANNA = uid("a", 1);
const BEN = uid("b", 1);
const SPECIES = 13;
const ANNA_SPECIMENS = 15; // 2 archived, 2 cuttings
const BEN_SPECIMENS = 2;
const SERIES = 5; // measurements per active plant of Anna, monthly

/** Accounts, Anna's four light zones and five locations (three with a zone, two without). */
async function seedLight(db: pg.Pool) {
  for (const [id, subject] of [
    [ANNA, "realistic-anna"],
    [BEN, "realistic-ben"],
  ])
    await db.query("insert into account (id, subject) values ($1, $2)", [id, subject]);
  const zones = [
    ["Lampe 1", 1500],
    ["Lampe 2", 15000],
    ["Lampe 3", 30000],
    ["Lampe 4", 100000],
  ] as const;
  for (const [i, [name, lux]] of zones.entries())
    await db.query(
      "insert into light_zone (id, account_id, name, lux_ceiling, sort_order) values ($1, $2, $3, $4, $5)",
      [uid("c", i + 1), ANNA, name, lux, i + 1],
    );
  const locations = ["Fensterbank Süd", "Regal Wohnzimmer", "Pflanzenlampe", "Flur", "Balkon"];
  for (const [i, name] of locations.entries())
    await db.query(
      "insert into location (id, account_id, name, light_zone_id, kind) values ($1, $2, $3, $4, $5)",
      [uid("d", i + 1), ANNA, name, i < 3 ? uid("c", i + 2) : null, i === 4 ? "outdoor" : "indoor"],
    );
}

/** 13 species, each with its review case (a keeper's proposal). */
async function seedSpecies(db: pg.Pool) {
  for (let i = 1; i <= SPECIES; i += 1) {
    const id = uid("e", i);
    await db.query(
      "insert into review_case (account_id, object_kind, object_id, status) values ($1, 'species', $2, 'proposal')",
      [ANNA, id],
    );
    await db.query(
      `insert into species (id, genus, epithet, latin_name, german_name, difficulty, standard_level, light_demand_lux,
         growth_measure, etiolation_signs, success_criteria, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, 'height', 'Lange Internodien.', 'Kompakter Wuchs.', 'user')`,
      [
        id,
        `Genus${i}`,
        `species${i}`,
        `Genus${i} species${i}`,
        `Art ${i}`,
        (i % 3) + 1,
        (i % 3) + 2,
        5000 * i,
      ],
    );
  }
}

/** Specimen `i`: 1 and 2 archived, 3 and 4 cuttings, up to 15 Anna's at her locations, the rest Ben's without one. */
function specimenRow(i: number) {
  const ben = i > ANNA_SPECIMENS;
  const archived = !ben && i <= 2;
  const status = archived ? "archived" : !ben && i <= 4 ? "cutting" : "plant";
  const archive = archived ? ["2026-05-01", "eingegangen", "plant"] : [null, null, null];
  return [
    uid("f", i),
    ben ? BEN : ANNA,
    uid("e", ((i - 1) % SPECIES) + 1),
    `Pflanze ${i}`,
    ben ? null : uid("d", ((i - 1) % 5) + 1),
    status,
    `2025-0${(i % 9) + 1}-15`,
    ...archive,
  ];
}

/** The fixture, written for the schema as of `BASELINE` (as superuser: it seeds, it does not test the row rules). */
async function seed(db: pg.Pool) {
  await seedLight(db);
  await seedSpecies(db);
  for (let i = 1; i <= ANNA_SPECIMENS + BEN_SPECIMENS; i += 1)
    await db.query(
      `insert into specimen (id, account_id, species_id, name, location_id, status, caught_at, archived_at,
         archived_reason, status_before_archived)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      specimenRow(i),
    );
  for (let i = 5; i <= ANNA_SPECIMENS; i += 1)
    for (let m = 1; m <= SERIES; m += 1)
      await db.query(
        `insert into measurement (account_id, specimen_id, date, value, quality, note)
         values ($1, $2, $3, $4, $5, $6)`,
        [
          ANNA,
          uid("f", i),
          `2026-0${m + 3}-01`,
          10 + i + m * 1.5,
          m === SERIES && i % 4 === 0 ? "etiolated" : "healthy",
          m === 1 ? `Erste Messung von Pflanze ${i}` : null,
        ],
      );
}

const MEASUREMENTS = (ANNA_SPECIMENS - 4) * SERIES;
const count = async (db: pg.Pool | pg.PoolClient, sql: string) =>
  Number((await db.query<{ n: string }>(sql)).rows[0]?.n);

beforeAll(async () => {
  admin = openAdminPool();
  await admin.query(`create database ${DB}`);
  const url = new URL(testDatabaseUrl());
  url.pathname = `/${DB}`;
  scratch = openPool(url.toString());
  scratch.on("error", () => undefined);
  const before = mkdtempSync(join(tmpdir(), "realistic-"));
  for (const f of readdirSync(MIGRATIONS_DIRECTORY).filter((n) => n < BASELINE))
    copyFileSync(join(MIGRATIONS_DIRECTORY, f), join(before, f));
  await migrate(scratch, { directory: before });
  await seed(scratch);
  applied = await migrate(scratch);
}, 120_000);
afterAll(async () => {
  await scratch.end();
  await admin.query(`drop database if exists ${DB} with (force)`);
  await admin.end();
});

describe("US-DEV-07 every migration runs on realistic data", () => {
  it("US-DEV-07 all migrations after the baseline apply on the filled database", () => {
    expect(applied[0]?.startsWith(BASELINE)).toBe(true);
    const all = readdirSync(MIGRATIONS_DIRECTORY).filter(
      (n) => n.endsWith(".sql") && n >= BASELINE,
    );
    expect(applied).toEqual(all.sort());
  });

  it("US-DEV-07 no row is lost: species, specimens, measurements, zones and locations keep their count and values", async () => {
    expect(await count(scratch, "select count(*) n from species")).toBe(SPECIES);
    expect(await count(scratch, "select count(*) n from specimen")).toBe(
      ANNA_SPECIMENS + BEN_SPECIMENS,
    );
    expect(await count(scratch, "select count(*) n from specimen where status = 'archived'")).toBe(
      2,
    );
    expect(await count(scratch, "select count(*) n from measurement")).toBe(MEASUREMENTS);
    expect(await count(scratch, "select count(*) n from light_zone")).toBe(4);
    expect(await count(scratch, "select count(*) n from location")).toBe(5);
    const sum = (await scratch.query<{ s: string }>("select sum(value) s from measurement")).rows[0]
      ?.s;
    let expected = 0;
    for (let i = 5; i <= ANNA_SPECIMENS; i += 1)
      for (let m = 1; m <= SERIES; m += 1) expected += 10 + i + m * 1.5;
    expect(Number(sum)).toBe(expected);
  });

  it("US-DEV-07 the references stay intact: every specimen keeps its species, location and zone", async () => {
    expect(
      await count(
        scratch,
        `select count(*) n from specimen s join species a on a.id = s.species_id
           left join location l on l.id = s.location_id left join light_zone z on z.id = l.light_zone_id
          where s.location_id is null or l.id is not null`,
      ),
    ).toBe(ANNA_SPECIMENS + BEN_SPECIMENS);
    expect(
      await count(
        scratch,
        "select count(*) n from measurement m join specimen s on s.id = m.specimen_id",
      ),
    ).toBe(MEASUREMENTS);
  });

  it("US-DEV-07 NFR-09 the row rules still keep the accounts apart after all migrations", async () => {
    const own = (account: string) =>
      withAccount(scratch, account, async (c) => ({
        specimens: await count(c, "select count(*) n from specimen"),
        measurements: await count(c, "select count(*) n from measurement"),
        locations: await count(c, "select count(*) n from location"),
      }));
    expect(await own(ANNA)).toEqual({
      specimens: ANNA_SPECIMENS,
      measurements: MEASUREMENTS,
      locations: 5,
    });
    expect(await own(BEN)).toEqual({ specimens: BEN_SPECIMENS, measurements: 0, locations: 0 });
  });
});
