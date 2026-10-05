import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SpecimenPostgres } from "../collection/index.ts";
import { createFixtureSpeciesAt } from "../fixtures.ts";
import { migrate, withAccount, openPool } from "../kernel/index.ts";
import { MeasurementsPostgres } from "./index.ts";

// US-WAC-01, DM-WAC-01, P-04: Messungen je Konto (echte PostgreSQL, `make db-up`).
let pool: Pool;
let measurements: MeasurementsPostgres;
const anna = randomUUID();
const ben = randomUUID();
let specimenAnna = "";
let specimenBen = "";
let species = "";
const values = (extra: Record<string, unknown> = {}) => ({
  specimenId: specimenAnna,
  date: "2026-10-03",
  value: 12.5,
  quality: "healthy" as const,
  note: null,
  ratedBy: "keeper" as const,
  ...extra,
});

async function specimen(account: string, name: string): Promise<string> {
  const z = await new SpecimenPostgres(pool).create(account, {
    speciesId: species,
    name,
    marker: null,
    locationId: null,
    caughtAt: null,
  });
  if (typeof z === "string") throw new Error(z);
  return z.id;
}

beforeAll(async () => {
  pool = openPool();
  await migrate(pool);
  species = await createFixtureSpeciesAt(pool);
  measurements = new MeasurementsPostgres(pool);
  for (const id of [anna, ben])
    await withAccount(pool, id, (c) => c.query("insert into account (id) values ($1)", [id]));
  specimenAnna = await specimen(anna, "Anna Pflanze");
  specimenBen = await specimen(ben, "Ben Pflanze");
});
afterAll(async () => {
  await pool.query("delete from account where id = any($1)", [[anna, ben]]);
  await pool.end();
});

describe("US-WAC-01 measurements in the database", () => {
  it("stores and reads back number, quality, note and date", async () => {
    const z = await measurements.create(
      anna,
      values({ value: 14.5, quality: "etiolated", note: "gestreckt" }),
    );
    expect(z).toMatchObject({
      specimenId: specimenAnna,
      date: "2026-10-03",
      value: 14.5,
      quality: "etiolated",
      note: "gestreckt",
      ratedBy: "keeper",
    });
    expect(await measurements.list(anna, specimenAnna)).toContainEqual(z);
  });

  it("the date stays the stored calendar date, independent of the server's time zone (NFR-08)", async () => {
    const before = process.env["TZ"];
    process.env["TZ"] = "Pacific/Kiritimati";
    try {
      const z = await measurements.create(anna, values({ date: "2026-01-01" }));
      expect(z).toMatchObject({ date: "2026-01-01" });
      expect(await measurements.list(anna, specimenAnna)).toContainEqual(z);
    } finally {
      if (before === undefined) delete process.env["TZ"];
      else process.env["TZ"] = before;
    }
  });

  it("returns newest first: by date, with the same date the one recorded last", async () => {
    const ex = await specimen(anna, "Reihenfolge");
    await measurements.create(anna, values({ specimenId: ex, date: "2026-09-01", value: 10 }));
    await measurements.create(anna, values({ specimenId: ex, date: "2026-10-01", value: 20 }));
    await measurements.create(anna, values({ specimenId: ex, date: "2026-10-01", value: 21 }));
    expect((await measurements.list(anna, ex)).map((m) => m.value)).toEqual([21, 20, 10]);
  });

  it("an account creates no measurement on a foreign specimen and sees no foreign ones (P-04)", async () => {
    expect(await measurements.create(anna, values({ specimenId: specimenBen }))).toBe(
      "specimen_unknown",
    );
    expect(await measurements.create(ben, values({ specimenId: specimenBen }))).toMatchObject({
      specimenId: specimenBen,
    });
    expect(await measurements.list(anna, specimenBen)).toEqual([]);
    expect(await measurements.list(ben, specimenAnna)).toEqual([]);
  });

  it("values outside the limits fail already in the database", async () => {
    for (const extra of [{ value: -0.5 }, { value: 10_001 }, { quality: "super" }, { note: "" }])
      await expect(measurements.create(anna, values(extra))).rejects.toThrow();
  });

  it("deleting the account takes its measurements along", async () => {
    const account = randomUUID();
    await withAccount(pool, account, (c) =>
      c.query("insert into account (id) values ($1)", [account]),
    );
    const ex = await specimen(account, "Weg");
    await measurements.create(account, values({ specimenId: ex }));
    await pool.query("delete from account where id = $1", [account]);
    const r = await pool.query("select 1 from measurement where specimen_id = $1", [ex]);
    expect(r.rowCount).toBe(0);
  });
});

describe("US-WAC-01 last measurement per specimen (for the cards, US-BES-06)", () => {
  it("returns the latest measurement per specimen; with the same date the one recorded last", async () => {
    const e = await specimen(anna, "Last plant");
    await measurements.create(anna, values({ specimenId: e, date: "2026-09-01", value: 8 }));
    await measurements.create(anna, values({ specimenId: e, date: "2026-10-02", value: 9 }));
    await measurements.create(
      anna,
      values({ specimenId: e, date: "2026-10-02", value: 9.5, quality: "etiolated" }),
    );
    const r = await measurements.lastFor(anna, [e]);
    expect(r.size).toBe(1);
    expect(r.get(e)).toMatchObject({ date: "2026-10-02", value: 9.5, quality: "etiolated" });
  });

  it("a specimen without a measurement is missing; without IDs the answer is empty", async () => {
    const empty = await specimen(anna, "Without measurement");
    expect((await measurements.lastFor(anna, [empty])).size).toBe(0);
    expect((await measurements.lastFor(anna, [])).size).toBe(0);
  });

  it("tenant: Ben asks for Anna's specimen and gets nothing; Anna does not see Ben's measurement", async () => {
    const e = await specimen(anna, "Anna's last");
    await measurements.create(anna, values({ specimenId: e }));
    await measurements.create(ben, values({ specimenId: specimenBen }));
    expect((await measurements.lastFor(ben, [e])).size).toBe(0);
    expect((await measurements.lastFor(anna, [specimenBen])).size).toBe(0);
    expect((await measurements.lastFor(ben, [specimenBen])).size).toBe(1);
  });
});

describe("US-WAC-02 quality of a measurement in the database", () => {
  it("a measurement written without quality (imported legacy data) reads back as healthy", async () => {
    const ex = await specimen(anna, "Altdaten");
    await withAccount(pool, anna, (c) =>
      c.query(
        "insert into measurement (account_id, specimen_id, date, value) values ($1, $2, '2025-06-01', 8)",
        [anna, ex],
      ),
    );
    expect(await measurements.list(anna, ex)).toEqual([
      expect.objectContaining({ date: "2025-06-01", value: 8, quality: "healthy" }),
    ]);
  });

  it("an explicit empty quality is refused, so no measurement is left without one", async () => {
    const ex = await specimen(anna, "Ohne Qualität");
    await expect(
      withAccount(pool, anna, (c) =>
        c.query(
          "insert into measurement (account_id, specimen_id, date, value, quality) values ($1, $2, '2025-06-01', 8, null)",
          [anna, ex],
        ),
      ),
    ).rejects.toThrow();
    expect(await measurements.list(anna, ex)).toEqual([]);
  });
});
