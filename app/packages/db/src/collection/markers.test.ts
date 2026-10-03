import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, withAccount, openPool } from "../kernel/index.ts";
import { createFixtureSpeciesAt } from "../fixtures.ts";
import { SpecimenPostgres, type SpecimenRow } from "./specimens.ts";

// US-BES-03: markers per species and renaming (real PostgreSQL, `make db-up`).
let pool: Pool;
let specimens: SpecimenPostgres;
const anna = randomUUID();
const ben = randomUUID();
let species = "";

const values = (name: string, marker: string | null) => ({
  speciesId: species,
  name,
  marker,
  locationId: null,
  caughtAt: "2026-10-03",
});
const made = async (account: string, name: string, marker: string | null = null) => {
  const r = await specimens.create(account, values(name, marker));
  if (typeof r === "string") throw new Error(r);
  return r;
};
const names = async (account: string) =>
  (await specimens.list(account)).map((z: SpecimenRow) => z.name).sort();

beforeAll(async () => {
  pool = openPool();
  await migrate(pool);
  species = await createFixtureSpeciesAt(pool);
  specimens = new SpecimenPostgres(pool);
  for (const id of [anna, ben])
    await withAccount(pool, id, (c) => c.query("insert into account (id) values ($1)", [id]));
});
afterAll(async () => {
  await pool.query("delete from account where id = any($1)", [[anna, ben]]);
  await pool.end();
});

describe("US-BES-03 the marker is unique per species and account (case-insensitive)", () => {
  it("a second specimen with the same marker is refused even under another name", async () => {
    await made(anna, "Kennz A rot", "rot");
    expect(await specimens.create(anna, values("Kennz A anders", "ROT"))).toBe("marker_taken");
    expect(await names(anna)).toEqual(["Kennz A rot"]);
  });

  it("another account may use the same marker", async () => {
    await made(ben, "Kennz B rot", "rot");
    expect(await names(ben)).toEqual(["Kennz B rot"]);
  });

  it("specimens without a marker do not collide with each other", async () => {
    await made(ben, "Ohne eins");
    await made(ben, "Ohne zwei");
    expect(await names(ben)).toHaveLength(3);
  });
});

describe("US-BES-03 create with markers for existing specimens is all or nothing", () => {
  it("renames the existing specimens and creates the new one in one transaction", async () => {
    const eins = await made(anna, "Atomar");
    const r = await specimens.create(anna, values("Atomar – neu", "neu"), [
      { specimenId: eins.id, name: "Atomar – eins", marker: "eins" },
    ]);
    expect(r).toMatchObject({ name: "Atomar – neu" });
    expect(await specimens.find(anna, eins.id)).toMatchObject({
      name: "Atomar – eins",
      marker: "eins",
    });
  });

  it("a failing new specimen undoes the renames", async () => {
    const eins = await made(anna, "Zurueck");
    await made(anna, "Zurueck – belegt", "belegt");
    const r = await specimens.create(anna, values("Zurueck – belegt", "x"), [
      { specimenId: eins.id, name: "Zurueck – eins", marker: "eins" },
    ]);
    expect(r).toBe("name_taken");
    expect(await specimens.find(anna, eins.id)).toMatchObject({ name: "Zurueck", marker: null });
  });

  it("a taken marker among the answers refuses everything", async () => {
    const eins = await made(anna, "Doppelt");
    const r = await specimens.create(anna, values("Doppelt – a", "a"), [
      { specimenId: eins.id, name: "Doppelt – a", marker: "A" },
    ]);
    expect(r === "marker_taken" || r === "name_taken").toBe(true);
    expect(await specimens.find(anna, eins.id)).toMatchObject({ name: "Doppelt", marker: null });
    expect((await names(anna)).filter((n) => n.startsWith("Doppelt"))).toEqual(["Doppelt"]);
  });

  it("an unknown or foreign specimen among the answers refuses everything, the foreign one is untouched", async () => {
    const foreign = await made(ben, "Fremd");
    const r = await specimens.create(anna, values("Fremd – neu", "neu"), [
      { specimenId: foreign.id, name: "Fremd – x", marker: "x" },
    ]);
    expect(r).toBe("specimen_unknown");
    expect(await specimens.find(ben, foreign.id)).toMatchObject({ name: "Fremd", marker: null });
    expect(await names(anna)).not.toContain("Fremd – neu");
  });
});

describe("US-BES-03 rename in the database", () => {
  it("sets marker and name, id and the rest stay", async () => {
    const z = await made(anna, "Umbenennen");
    const r = await specimens.mark(anna, z.id, { name: "Umbenennen – rot", marker: "rot" });
    expect(r).toEqual({ ...z, name: "Umbenennen – rot", marker: "rot" });
  });

  it("a taken marker (case-insensitive) or name changes nothing", async () => {
    await made(anna, "Beleg – rot", "rot");
    const z = await made(anna, "Beleg");
    expect(await specimens.mark(anna, z.id, { name: "Beleg – ROT", marker: "ROT" })).toBe(
      "marker_taken",
    );
    await made(anna, "Beleg – blau");
    expect(await specimens.mark(anna, z.id, { name: "Beleg – blau", marker: "blau" })).toBe(
      "name_taken",
    );
    expect(await specimens.find(anna, z.id)).toEqual(z);
  });

  it("the specimen's own marker may change case", async () => {
    const z = await made(anna, "Gross – rot", "rot");
    expect(await specimens.mark(anna, z.id, { name: "Gross – Rot", marker: "Rot" })).toMatchObject({
      marker: "Rot",
    });
  });

  it("an archived specimen is not renamed", async () => {
    const z = await made(anna, "Archiv");
    await specimens.archive(anna, z.id, "abgegeben", "2026-10-03");
    const before = await specimens.find(anna, z.id);
    expect(await specimens.mark(anna, z.id, { name: "Archiv – x", marker: "x" })).toBe("archived");
    expect(await specimens.find(anna, z.id)).toEqual(before);
  });

  it("a foreign or unknown specimen is not found and stays unchanged (P-04)", async () => {
    const z = await made(ben, "Mandant");
    expect(await specimens.mark(anna, z.id, { name: "Mandant – x", marker: "x" })).toBe(
      "not_found",
    );
    expect(await specimens.mark(anna, randomUUID(), { name: "Y", marker: "y" })).toBe("not_found");
    expect(await specimens.find(ben, z.id)).toEqual(z);
  });
});
