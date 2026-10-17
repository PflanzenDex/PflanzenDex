import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, withAccount, openOwnerPool, openFixturePool } from "../kernel/index.ts";
import { createFixtureSpeciesAt } from "../fixtures.ts";
import { LocationPostgres, ZonePostgres } from "../light/index.ts";
import { SpecimenPostgres } from "./index.ts";
import type { SpecimenRow } from "./specimens.ts";

// US-PHA-03, US-BES-08, P-04: set the location of specimens (real PostgreSQL, `make db-up`).
let pool: Pool;
// Deliberate cross-tenant cleanup/observation of FORCE-d tables: needs the superuser, the suite owner is under row security (#294).
let admin: Pool;
let specimens: SpecimenPostgres;
let locations: LocationPostgres;
let zones: ZonePostgres;
const anna = randomUUID();
const ben = randomUUID();
let species = "";

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  species = await createFixtureSpeciesAt();
  specimens = new SpecimenPostgres(pool);
  locations = new LocationPostgres(pool);
  zones = new ZonePostgres(pool);
  for (const id of [anna, ben])
    await withAccount(pool, id, (c) => c.query("insert into account (id) values ($1)", [id]));
});
afterAll(async () => {
  await admin.query("delete from account where id = any($1)", [[anna, ben]]);
  await admin.end();
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

// US-LIC-02, US-BES-04, QG-D1, P-04: the own light zone of a specimen.
const zone = async (account: string, name: string) => {
  const z = await zones.create(account, { name, luxCeiling: 20_000, ppfd: null, sortOrder: null });
  if (typeof z === "string") throw new Error(z);
  return z.id;
};
describe("US-LIC-02 own light zone of a specimen in the database", () => {
  it("US-LIC-02: a new specimen has no own zone; set, repeat and clear", async () => {
    const z = await specimen(anna, "Zone Eins");
    expect(z.lightZoneId ?? null).toBeNull();
    const a = await zone(anna, "Zone A");
    expect(await specimens.setLightZone(anna, z.id, a)).toMatchObject({ id: z.id, lightZoneId: a });
    expect(await specimens.setLightZone(anna, z.id, a)).toMatchObject({ lightZoneId: a });
    expect((await specimens.find(anna, z.id))?.lightZoneId).toBe(a);
    expect(await specimens.setLightZone(anna, z.id, null)).toMatchObject({ lightZoneId: null });
  });

  it("QG-D1, P-04: a zone of another account violates the same-account foreign key", async () => {
    const z = await specimen(anna, "Zone Fremd");
    const bens = await zone(ben, "Bens Zone");
    expect(await specimens.setLightZone(anna, z.id, bens)).toBe("zone_unknown");
    expect((await specimens.find(anna, z.id))?.lightZoneId ?? null).toBeNull();
  });

  it("QG-D1, P-04: a foreign specimen is invisible, so it looks unknown and stays unchanged", async () => {
    const z = await specimen(ben, "Bens Exemplar");
    const a = await zone(anna, "Zone B");
    expect(await specimens.setLightZone(anna, z.id, a)).toBe("not_found");
    expect((await specimens.find(ben, z.id))?.lightZoneId ?? null).toBeNull();
  });

  it("US-BES-07: an archived specimen stays unchanged", async () => {
    const z = await specimen(anna, "Zone Archiv");
    await specimens.archive(anna, z.id, "eingegangen", "2026-10-04");
    const a = await zone(anna, "Zone C");
    expect(await specimens.setLightZone(anna, z.id, a)).toBe("archived");
  });

  it("US-LIC-05, P-10: a zone a specimen carries is named as user and cannot be deleted unnoticed", async () => {
    const z = await specimen(anna, "Zone Nutzer");
    const a = await zone(anna, "Zone D");
    await specimens.setLightZone(anna, z.id, a);
    expect(await specimens.zoneUsers(anna, a)).toEqual([
      { kind: "specimen", id: z.id, name: "Zone Nutzer" },
    ]);
    expect(await specimens.zoneUsers(ben, a)).toEqual([]);
    expect(await zones.remove(anna, a)).toBe("in_use");
    await specimens.setLightZone(anna, z.id, null);
    expect(await zones.remove(anna, a)).toBe("deleted");
  });

  it("US-LIC-02: a specimen can be created with its own zone; a zone of another account is refused", async () => {
    const mine = await zone(anna, "Zone Neu");
    const bens = await zone(ben, "Bens Zone Neu");
    const base = { speciesId: species, marker: null, locationId: null, caughtAt: "2026-10-03" };
    const made = await specimens.create(anna, { ...base, name: "Zone Neu", lightZoneId: mine });
    expect(made).toMatchObject({ name: "Zone Neu", lightZoneId: mine });
    expect(
      await specimens.create(anna, { ...base, name: "Zone Fremd Neu", lightZoneId: bens }),
    ).toBe("zone_unknown");
  });
});
