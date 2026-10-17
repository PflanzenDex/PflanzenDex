import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFixtureSpeciesAt } from "../fixtures.ts";
import { SpecimenPostgres } from "../collection/index.ts";
import { migrate, openFixturePool, openOwnerPool, withAccount } from "../kernel/index.ts";
import { ActiveSpeciesPostgres } from "./index.ts";

// US-POK-14, P-04: which species do chosen accounts own (real PostgreSQL, `make db-up`).
let pool: Pool;
let admin: Pool;
let specimens: SpecimenPostgres;
let active: ActiveSpeciesPostgres;
let species = "";
const anna = randomUUID();
const ben = randomUUID();
const solo = randomUUID();
const values = (name: string) => ({
  speciesId: species,
  name,
  marker: null,
  locationId: null,
  caughtAt: "2026-10-03",
});

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  species = await createFixtureSpeciesAt();
  specimens = new SpecimenPostgres(pool);
  active = new ActiveSpeciesPostgres(pool);
  for (const id of [anna, ben, solo])
    await withAccount(pool, id, (c) => c.query("insert into account (id) values ($1)", [id]));
});
afterAll(async () => {
  await admin.query("delete from account where id = any($1)", [[anna, ben, solo]]);
  await admin.end();
  await pool.end();
});

const make = async (account: string, name: string) => {
  const r = await specimens.create(account, values(name));
  if (typeof r === "string") throw new Error(r);
  return r.id;
};

describe("US-POK-14 active species of chosen accounts", () => {
  it("US-POK-14 returns one row per account and species, for the asked accounts only, without archived ones", async () => {
    await make(anna, "Eins");
    await make(anna, "Zwei");
    const gone = await make(anna, "Drei");
    await specimens.archive(anna, gone, "abgegeben", "2026-10-04");
    await make(ben, "Vier");
    expect(await active.activeSpeciesOf([anna])).toEqual([{ accountId: anna, speciesId: species }]);
    expect(await active.activeSpeciesOf([anna, ben])).toHaveLength(2);
    expect(await active.activeSpeciesOf([])).toEqual([]);
  });

  it("US-POK-14 an archived specimen alone does not count and an unasked account never appears", async () => {
    const id = await make(solo, "Weg");
    await specimens.archive(solo, id, "abgegeben", "2026-10-04");
    expect(await active.activeSpeciesOf([solo])).toEqual([]);
    expect((await active.activeSpeciesOf([ben])).map((r) => r.accountId)).toEqual([ben]);
  });
});
