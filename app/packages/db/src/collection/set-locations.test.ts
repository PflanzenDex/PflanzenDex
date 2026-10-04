import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, withAccount, openPool } from "../kernel/index.ts";
import { createFixtureSpeciesAt } from "../fixtures.ts";
import { LocationPostgres } from "../light/index.ts";
import { SpecimenPostgres } from "./index.ts";
import type { SpecimenRow } from "./specimens.ts";

// US-PHA-03, US-BES-08, P-04: set the location of specimens (real PostgreSQL, `make db-up`).
let pool: Pool;
let specimens: SpecimenPostgres;
let locations: LocationPostgres;
const anna = randomUUID();
const ben = randomUUID();
let species = "";

beforeAll(async () => {
  pool = openPool();
  await migrate(pool);
  species = await createFixtureSpeciesAt(pool);
  specimens = new SpecimenPostgres(pool);
  locations = new LocationPostgres(pool);
  for (const id of [anna, ben])
    await withAccount(pool, id, (c) => c.query("insert into account (id) values ($1)", [id]));
});
afterAll(async () => {
  await pool.query("delete from account where id = any($1)", [[anna, ben]]);
  await pool.end();
});

const location = async (account: string, name: string) => {
  const s = await locations.create(account, { name, lightZoneId: null, kind: "indoor" });
  if (typeof s === "string") throw new Error(s);
  return s.id;
};
const specimen = async (account: string, name: string, locationId: string | null = null) => {
  const z = await specimens.create(account, {
    speciesId: species,
    name,
    marker: null,
    locationId,
    caughtAt: "2026-10-03",
  });
  if (typeof z === "string") throw new Error(z);
  return z;
};
const rows = (r: Awaited<ReturnType<SpecimenPostgres["setLocations"]>>) => r as SpecimenRow[];

describe("US-PHA-03 set locations in the database", () => {
  it("US-PHA-03 sets the location of several specimens in one call and returns the rows in order", async () => {
    const [a, b] = [await location(anna, "A1"), await location(anna, "A2")];
    const [x, y] = [await specimen(anna, "Eins"), await specimen(anna, "Zwei", a)];
    const r = rows(
      await specimens.setLocations(anna, [
        { specimenId: y.id, locationId: b },
        { specimenId: x.id, locationId: a },
      ]),
    );
    expect(r.map((z) => [z.id, z.locationId])).toEqual([
      [y.id, b],
      [x.id, a],
    ]);
    expect((await specimens.find(anna, x.id))?.locationId).toBe(a);
    expect((await specimens.find(anna, y.id))?.locationId).toBe(b);
  });

  it("US-PHA-03 setting the location it already has is a plain no-op (idempotent)", async () => {
    const a = await location(anna, "Gleich");
    const z = await specimen(anna, "Gleich", a);
    const r = rows(await specimens.setLocations(anna, [{ specimenId: z.id, locationId: a }]));
    expect(r).toEqual([z]);
  });

  it("US-PHA-03 an unknown specimen undoes the whole call", async () => {
    const a = await location(anna, "Rollback");
    const z = await specimen(anna, "Rollback");
    const r = await specimens.setLocations(anna, [
      { specimenId: z.id, locationId: a },
      { specimenId: randomUUID(), locationId: a },
    ]);
    expect(r).toBe("specimen_unknown");
    expect((await specimens.find(anna, z.id))?.locationId).toBeNull();
  });

  it("US-PHA-03 an archived specimen is refused and keeps its location", async () => {
    const [a, b] = [await location(anna, "Archiv1"), await location(anna, "Archiv2")];
    const z = await specimen(anna, "Archiviert", a);
    await specimens.archive(anna, z.id, "eingegangen", "2026-10-03");
    expect(await specimens.setLocations(anna, [{ specimenId: z.id, locationId: b }])).toBe(
      "archived",
    );
    expect((await specimens.find(anna, z.id))?.locationId).toBe(a);
  });

  it("US-PHA-03, P-04 a location of another account is refused by the composite foreign key", async () => {
    const foreign = await location(ben, "Bens Standort");
    const z = await specimen(anna, "Fremder Standort");
    expect(await specimens.setLocations(anna, [{ specimenId: z.id, locationId: foreign }])).toBe(
      "location_unknown",
    );
    expect((await specimens.find(anna, z.id))?.locationId).toBeNull();
  });

  it("US-PHA-03, P-04 another account neither sees nor changes the specimen", async () => {
    const [a, b] = [await location(anna, "Privat"), await location(ben, "Bens Privat")];
    const z = await specimen(anna, "Privat", a);
    expect(await specimens.setLocations(ben, [{ specimenId: z.id, locationId: b }])).toBe(
      "specimen_unknown",
    );
    expect((await specimens.find(anna, z.id))?.locationId).toBe(a);
  });
});
