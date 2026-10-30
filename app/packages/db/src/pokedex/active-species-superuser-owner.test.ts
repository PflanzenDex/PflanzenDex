import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createAccountWithName,
  createFixtureSpecimen,
  createSuperuserOwnerDatabase,
  type SuperuserOwnerDatabase,
} from "../fixtures.ts";
import { FIXTURE_SPECIES_ID } from "../collection/index.ts";
import { ActiveSpeciesPostgres } from "./index.ts";

// #907, US-POK-14, P-04, P-05, QG-D1: `active_species_of()` with a SUPERUSER as owner of the tables (a scratch database,
// see createSuperuserOwnerDatabase). Before migration 0093 it answered with the species of every account for each asked
// id, so the rarity count could include accounts that never consented.
let db: SuperuserOwnerDatabase;
let pool: Pool;
let active: ActiveSpeciesPostgres;
const [anna, ben, cleo] = [randomUUID(), randomUUID(), randomUUID()];

beforeAll(async () => {
  db = await createSuperuserOwnerDatabase("active");
  pool = db.pool;
  active = new ActiveSpeciesPostgres(pool);
  for (const id of [anna, ben, cleo]) await createAccountWithName(pool, id, `S-${id.slice(0, 4)}`);
  await createFixtureSpecimen(pool, anna, "Annas Pflanze", pool);
  await createFixtureSpecimen(pool, ben, "Bens Pflanze", pool);
});
afterAll(async () => {
  await db.drop();
});

describe("US-POK-14 active_species_of() with a superuser as table owner (#907)", () => {
  it("US-POK-14 P-04 only the asked accounts are answered, one row per asked account", async () => {
    expect(await active.activeSpeciesOf([anna])).toEqual([
      { accountId: anna, speciesId: FIXTURE_SPECIES_ID },
    ]);
    const both = await active.activeSpeciesOf([anna, ben]);
    expect(both.map((r) => r.accountId).sort()).toEqual([anna, ben].sort());
  });

  it("US-POK-14 an account without a specimen, and one nobody asked for, add nothing", async () => {
    expect(await active.activeSpeciesOf([cleo])).toEqual([]);
    expect(await active.activeSpeciesOf([randomUUID()])).toEqual([]);
  });
});
