import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SpecimenPostgres } from "../collection/index.ts";
import { createFixtureSpeciesAt } from "../fixtures.ts";
import { migrate, openFixturePool, openOwnerPool, withAccount } from "../kernel/index.ts";
import { WateringPostgres } from "./index.ts";

// US-MON-05, DM-MON-01, P-04: the watering log per account (real PostgreSQL, `make db-up`).
let pool: Pool;
let admin: Pool; // superuser: cleanup and cross-tenant observation (#294)
let log: WateringPostgres;
const anna = randomUUID();
const ben = randomUUID();
let species = "";
let annas = "";
let bens = "";

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
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  species = await createFixtureSpeciesAt();
  log = new WateringPostgres(pool);
  for (const id of [anna, ben])
    await withAccount(pool, id, (c) => c.query("insert into account (id) values ($1)", [id]));
  annas = await specimen(anna, "Anna Pflanze");
  bens = await specimen(ben, "Ben Pflanze");
});
afterAll(async () => {
  await admin.query("delete from account where id = any($1)", [[anna, ben]]);
  await Promise.all([admin.end(), pool.end()]);
});

describe("US-MON-05 watering log in the database", () => {
  it("US-MON-05 records a date and answers the latest one per specimen as plain text", async () => {
    expect(await log.record(anna, [{ specimenId: annas, date: "2026-10-03" }])).toEqual({
      created: 1,
    });
    await log.record(anna, [{ specimenId: annas, date: "2026-10-08" }]);
    expect(await log.lastWatered(anna, [annas])).toEqual(new Map([[annas, "2026-10-08"]]));
  });

  it("US-MON-05 a repeat on the same day writes nothing new (US-QS-03)", async () => {
    expect(await log.record(anna, [{ specimenId: annas, date: "2026-10-08" }])).toEqual({
      created: 0,
    });
  });

  it("US-MON-05 a specimen never watered is absent", async () => {
    const other = await specimen(anna, "Ungegossen");
    expect((await log.lastWatered(anna, [other])).size).toBe(0);
  });

  it("P-04 an account neither sees nor writes entries of another account (composite foreign key and row rule)", async () => {
    await log.record(ben, [{ specimenId: bens, date: "2026-10-09" }]);
    expect((await log.lastWatered(anna, [bens])).size).toBe(0);
    await expect(log.record(anna, [{ specimenId: bens, date: "2026-10-09" }])).rejects.toThrow();
    const own = await admin.query(
      "select count(*)::int as n from watering_log where specimen_id = $1",
      [bens],
    );
    expect(own.rows[0].n).toBe(1);
  });

  it("US-MON-05 the database refuses an unknown source", async () => {
    await expect(
      admin.query(
        "insert into watering_log (account_id, specimen_id, watered_on, source) values ($1, $2, '2026-10-01', 'guess')",
        [anna, annas],
      ),
    ).rejects.toThrow();
  });
});
