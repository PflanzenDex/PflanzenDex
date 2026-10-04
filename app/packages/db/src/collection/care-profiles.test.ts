import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, withAccount, openPool } from "../kernel/index.ts";
import { createFixtureSpeciesAt } from "../fixtures.ts";
import { LocationPostgres, ZonePostgres } from "../light/index.ts";
import { CareProfilePostgres } from "./index.ts";

// US-BES-09, P-04, P-05: the care profile per account and species (real PostgreSQL, `make db-up`).
let pool: Pool;
let profiles: CareProfilePostgres;
let locations: LocationPostgres;
let zones: ZonePostgres;
const anna = randomUUID();
const ben = randomUUID();
let species = "";

beforeAll(async () => {
  pool = openPool();
  await migrate(pool);
  species = await createFixtureSpeciesAt(pool);
  profiles = new CareProfilePostgres(pool);
  locations = new LocationPostgres(pool);
  zones = new ZonePostgres(pool);
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
const zone = async (account: string, name: string) => {
  const z = await zones.create(account, { name, luxCeiling: 20000, ppfd: null, sortOrder: null });
  if (typeof z === "string") throw new Error(z);
  return z.id;
};

describe("US-BES-09 care profile in the database", () => {
  it("US-BES-09 the first change creates the profile, later ones change only the named fields", async () => {
    const loc = await location(anna, "Wohnzimmer");
    const first = await profiles.update(anna, species, {
      growthLocationId: loc,
      wateringGrowthDays: 7,
      dormancyFrom: "11-01",
      dormancyUntil: "03-15",
    });
    expect(first).toEqual({
      speciesId: species,
      growthLocationId: loc,
      dormancyLocationId: null,
      lightZoneId: null,
      dormancyFrom: "11-01",
      dormancyUntil: "03-15",
      wateringGrowthDays: 7,
      wateringDormancyDays: null,
      ownHints: null,
    });
    const second = await profiles.update(anna, species, { ownHints: "Trocken halten" });
    expect(second).toMatchObject({
      growthLocationId: loc,
      wateringGrowthDays: 7,
      dormancyFrom: "11-01",
      ownHints: "Trocken halten",
    });
    expect(await profiles.list(anna)).toEqual([second]);
  });

  it("US-BES-09 null resets exactly that field to the catalog; an empty profile stays valid", async () => {
    const loc = await location(anna, "Flur");
    await profiles.update(anna, species, { dormancyLocationId: loc, wateringDormancyDays: 21 });
    const r = await profiles.update(anna, species, { dormancyLocationId: null });
    expect(r).toMatchObject({ dormancyLocationId: null, wateringDormancyDays: 21 });
    const empty = await profiles.update(anna, species, {
      wateringDormancyDays: null,
      wateringGrowthDays: null,
      growthLocationId: null,
      dormancyFrom: null,
      dormancyUntil: null,
      ownHints: null,
    });
    expect(empty).toEqual({
      speciesId: species,
      growthLocationId: null,
      dormancyLocationId: null,
      lightZoneId: null,
      dormancyFrom: null,
      dormancyUntil: null,
      wateringGrowthDays: null,
      wateringDormancyDays: null,
      ownHints: null,
    });
  });

  it("US-BES-09 a location of another account is refused, nothing is written (composite foreign key, P-04)", async () => {
    const fremd = await location(ben, "Bens Flur");
    const before = await profiles.list(anna);
    expect(await profiles.update(anna, species, { growthLocationId: fremd })).toBe(
      "location_unknown",
    );
    expect(await profiles.update(anna, species, { dormancyLocationId: fremd })).toBe(
      "location_unknown",
    );
    expect(await profiles.list(anna)).toEqual(before);
  });

  it("US-BES-09 a zone of another account is refused (P-04)", async () => {
    const fremd = await zone(ben, "Bens Zone");
    expect(await profiles.update(anna, species, { lightZoneId: fremd })).toBe("zone_unknown");
  });

  it("US-BES-09 the zone override can be set and reset; the profile is private to the account (P-05)", async () => {
    const own = await zone(anna, "Annas Zone");
    expect(await profiles.update(anna, species, { lightZoneId: own })).toMatchObject({
      lightZoneId: own,
    });
    expect((await profiles.list(ben)).filter((p) => p.speciesId === species)).toEqual([]);
    expect(await profiles.update(anna, species, { lightZoneId: null })).toMatchObject({
      lightZoneId: null,
    });
  });

  it("US-BES-09 two accounts keep separate profiles of the same species", async () => {
    await profiles.update(anna, species, { wateringGrowthDays: 5 });
    await profiles.update(ben, species, { wateringGrowthDays: 30 });
    expect((await profiles.list(anna)).map((p) => p.wateringGrowthDays)).toEqual([5]);
    expect((await profiles.list(ben)).map((p) => p.wateringGrowthDays)).toEqual([30]);
  });

  it("US-BES-09 the database refuses what the operation would never send (checks)", async () => {
    const bad = (changes: Record<string, unknown>) =>
      withAccount(pool, anna, (c) =>
        c.query("update care_profile set dormancy_from = $1 where species_id = $2", [
          changes["from"],
          species,
        ]),
      );
    await expect(bad({ from: "13-45" })).rejects.toThrow();
    await expect(bad({ from: "11-01" })).rejects.toThrow(); // from without until
    await expect(profiles.update(anna, species, { wateringGrowthDays: 0 })).rejects.toThrow();
    await expect(profiles.update(anna, species, { ownHints: "" })).rejects.toThrow();
  });
});
