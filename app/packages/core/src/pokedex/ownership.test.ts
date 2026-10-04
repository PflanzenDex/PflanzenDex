import { beforeEach, describe, expect, it } from "vitest";
import { InMemorySpecimens, SpeciesStub, testSpecies } from "../collection/test-helpers";
import { pokedexOwnership, type OwnershipDependencies } from "./index";

const LEMON = "11111111-1111-4111-8111-111111111111";
const OPUNTIA_VAR = "22222222-2222-4222-8222-222222222222";
const OPUNTIA = "33333333-3333-4333-8333-333333333333";
const HIPPEASTRUM = "44444444-4444-4444-8444-444444444444";
const PARODIA = "55555555-5555-4555-8555-555555555555";
const BEN_ONLY = "66666666-6666-4666-8666-666666666666"; // visible to ben only

const latin = (id: string, latinName: string, only?: string) => ({
  species: testSpecies(id, { latinName }),
  ...(only ? { only } : {}),
});
const species = new SpeciesStub([
  latin(LEMON, "Citrus x limon"),
  latin(OPUNTIA_VAR, "Opuntia microdasys var. albispina"),
  latin(OPUNTIA, "Opuntia microdasys"),
  latin(HIPPEASTRUM, "Hippeastrum"),
  latin(PARODIA, "Parodia sp."),
  latin(BEN_ONLY, "Ficus lyrata", "ben"),
]);
const TZ = "Europe/Berlin";
let specimens: InMemorySpecimens;
let n = 0;
const deps = (): OwnershipDependencies => ({ specimens, species });

type Status = "plant" | "cutting" | "archived";
const add = async (userId: string, speciesId: string, status: Status = "plant", name?: string) => {
  n += 1;
  const r = await specimens.create(userId, {
    speciesId,
    name: name ?? `Pflanze ${n}`,
    marker: null,
    locationId: null,
    caughtAt: null,
  });
  if (typeof r === "string") throw new Error(r);
  const i = specimens.rows.findIndex((z) => z.id === r.id);
  const row = specimens.rows[i];
  if (status !== "plant" && row) specimens.rows[i] = { ...row, status };
  return r.id;
};

beforeEach(() => {
  specimens = new InMemorySpecimens();
});

describe("US-POK-06 ownership derived from the specimens", () => {
  it("US-POK-06 an active specimen catches its species (hybrid sign skipped)", async () => {
    await add("anna", LEMON);
    const r = await pokedexOwnership(deps(), "anna", TZ);
    expect(r.caught).toEqual([
      {
        species: "Citrus limon",
        genus: "Citrus",
        chips: [],
        specimenCount: 1,
        caughtDate: { date: "2026-10-01", source: "created_at" },
      },
    ]);
    expect(r.unidentified).toEqual([]);
  });

  it("US-POK-06 a cutting is an active specimen and counts", async () => {
    await add("anna", LEMON, "cutting");
    expect((await pokedexOwnership(deps(), "anna", TZ)).caught).toHaveLength(1);
  });

  it("US-POK-06 an archived specimen does not count", async () => {
    await add("anna", LEMON, "archived");
    const r = await pokedexOwnership(deps(), "anna", TZ);
    expect(r.caught).toEqual([]);
    expect(r.unidentified).toEqual([]);
  });

  it("US-POK-06 an archived specimen next to an active one of the species does not add to the count", async () => {
    await add("anna", LEMON);
    await add("anna", LEMON, "archived");
    expect((await pokedexOwnership(deps(), "anna", TZ)).caught[0]?.specimenCount).toBe(1);
  });

  it("US-POK-06 variety and plain species merge into one entry with the chip", async () => {
    await add("anna", OPUNTIA_VAR);
    await add("anna", OPUNTIA);
    const r = await pokedexOwnership(deps(), "anna", TZ);
    expect(r.caught).toEqual([
      {
        species: "Opuntia microdasys",
        genus: "Opuntia",
        chips: ["var. albispina"],
        specimenCount: 2,
        caughtDate: { date: "2026-10-01", source: "created_at" },
      },
    ]);
  });

  it("US-POK-06 caught species are sorted by name", async () => {
    await add("anna", OPUNTIA);
    await add("anna", LEMON);
    expect((await pokedexOwnership(deps(), "anna", TZ)).caught.map((c) => c.species)).toEqual([
      "Citrus limon",
      "Opuntia microdasys",
    ]);
  });

  it("US-POK-06 a missing epithet does not count and points out what to do (P-09, P-10)", async () => {
    await add("anna", HIPPEASTRUM, "plant", "Amaryllis");
    await add("anna", PARODIA, "plant", "Kugel");
    const r = await pokedexOwnership(deps(), "anna", TZ);
    expect(r.caught).toEqual([]);
    expect(r.unidentified.map((u) => u.specimenName)).toEqual(["Amaryllis", "Kugel"]);
    expect(r.unidentified[0]).toMatchObject({
      latinName: "Hippeastrum",
      nextAction: "Bestimme die Art, dann zählt es.",
    });
    expect(r.unidentified[0]?.text).toContain("Amaryllis");
  });

  it("US-POK-06 an archived specimen without epithet is not listed as unidentified", async () => {
    await add("anna", HIPPEASTRUM, "archived");
    expect((await pokedexOwnership(deps(), "anna", TZ)).unidentified).toEqual([]);
  });

  it("US-POK-06 a species the account cannot read does not count and is named, not dropped (P-10)", async () => {
    await add("anna", BEN_ONLY, "plant", "Geige");
    const r = await pokedexOwnership(deps(), "anna", TZ);
    expect(r.caught).toEqual([]);
    expect(r.unidentified).toEqual([
      expect.objectContaining({ specimenName: "Geige", latinName: null }),
    ]);
  });

  it("US-POK-06 two accounts: only the own specimens count (P-04)", async () => {
    await add("anna", LEMON);
    await add("ben", OPUNTIA);
    await add("ben", HIPPEASTRUM, "plant", "Bens Rätsel");
    const anna = await pokedexOwnership(deps(), "anna", TZ);
    expect(anna.caught.map((c) => c.species)).toEqual(["Citrus limon"]);
    expect(anna.unidentified).toEqual([]);
    const ben = await pokedexOwnership(deps(), "ben", TZ);
    expect(ben.caught.map((c) => c.species)).toEqual(["Opuntia microdasys"]);
    expect(ben.unidentified.map((u) => u.specimenName)).toEqual(["Bens Rätsel"]);
  });

  it("US-POK-06 the derivation writes nothing (P-01)", async () => {
    await add("anna", LEMON);
    const before = specimens.writes;
    await pokedexOwnership(deps(), "anna", TZ);
    expect(specimens.writes).toBe(before);
  });
});
