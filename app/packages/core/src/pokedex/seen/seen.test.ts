import { beforeEach, describe, expect, it } from "vitest";
import { InMemorySpecimens, SpeciesStub, testSpecies } from "../../collection/shared/test-helpers";
import { execute } from "../../kernel/operation";
import { InMemoryIdempotencyStore } from "../../kernel/test-helpers";
import { newlyCaught, pokedexMarkSeen, type SeenStore } from "../index";
import type { CaughtSpecies } from "../index";

const LEMON = "11111111-1111-4111-8111-111111111111";
const ALOE = "22222222-2222-4222-8222-222222222222";
const species = new SpeciesStub([
  { species: testSpecies(LEMON, { latinName: "Citrus x limon" }) },
  { species: testSpecies(ALOE, { latinName: "Aloe vera" }) },
]);

/** In-memory adapter for tests only; the real one lives in `db`. */
class InMemorySeen implements SeenStore {
  readonly rows = new Map<string, string[]>();
  writes = 0;
  async find(userId: string) {
    return this.rows.get(userId) ?? null;
  }
  async add(userId: string, keys: readonly string[]) {
    this.writes += 1;
    const merged = [...new Set([...(this.rows.get(userId) ?? []), ...keys])];
    this.rows.set(userId, merged);
    return merged;
  }
}

let specimens: InMemorySpecimens;
let seen: InMemorySeen;
let idem: InMemoryIdempotencyStore;
let n = 0;

const catchSpecies = async (userId: string, speciesId: string) => {
  n += 1;
  const r = await specimens.create(userId, {
    speciesId,
    name: `Pflanze ${n}`,
    marker: null,
    locationId: null,
    caughtAt: null,
  });
  if (typeof r === "string") throw new Error(r);
};
const mark = (userId: string, input: unknown, key = `k${++n}`) =>
  execute(
    pokedexMarkSeen({ seen, ownership: { specimens, species } }),
    { idempotency: idem },
    { context: { userId }, input, idempotencyKey: key },
  );

beforeEach(() => {
  specimens = new InMemorySpecimens();
  seen = new InMemorySeen();
  idem = new InMemoryIdempotencyStore();
});

const card = (name: string) => ({ species: name }) as CaughtSpecies;

describe("US-POK-12 new = caught species minus seen", () => {
  it("US-POK-12 lists the caught species that are not in the seen state", () => {
    const caught = [card("Aloe vera"), card("Citrus limon")];
    expect(newlyCaught(caught, ["Aloe vera"]).map((c) => c.species)).toEqual(["Citrus limon"]);
  });

  it("US-POK-12 shows nothing as new while the seen state is missing (first visit, silent)", () => {
    expect(newlyCaught([card("Aloe vera")], null)).toEqual([]);
  });

  it("US-POK-12 shows nothing as new when everything was seen", () => {
    expect(newlyCaught([card("Aloe vera")], ["Aloe vera", "Ficus lyrata"])).toEqual([]);
  });
});

describe("US-POK-12 marking the species as seen (P-03)", () => {
  it("US-POK-12 creates the seen state of an account that has none with the given caught species", async () => {
    await catchSpecies("anna", LEMON);
    expect(await mark("anna", { species: ["Citrus limon"] })).toMatchObject({
      ok: true,
      value: { seen: ["Citrus limon"] },
    });
    expect(await seen.find("anna")).toEqual(["Citrus limon"]);
  });

  it("US-POK-12 creates an empty seen state for an account without caught species", async () => {
    expect(await mark("anna", { species: [] })).toMatchObject({ ok: true, value: { seen: [] } });
    expect(await seen.find("anna")).toEqual([]);
  });

  it("US-POK-12 adds to the seen state, species caught later stay new until acknowledged", async () => {
    await catchSpecies("anna", LEMON);
    await mark("anna", { species: ["Citrus limon"] });
    await catchSpecies("anna", ALOE);
    expect(await seen.find("anna")).toEqual(["Citrus limon"]);
    await mark("anna", { species: ["Aloe vera"] });
    expect(await seen.find("anna")).toEqual(["Citrus limon", "Aloe vera"]);
  });

  it("US-POK-12 refuses a species the account has not caught and writes nothing", async () => {
    await catchSpecies("anna", LEMON);
    const r = await mark("anna", { species: ["Aloe vera"] });
    expect(r).toMatchObject({ ok: false, error: { code: "pokedex.not_caught" } });
    expect(seen.writes).toBe(0);
  });

  it("US-POK-12 refuses a species that only another account has caught (P-04)", async () => {
    await catchSpecies("ben", LEMON);
    const r = await mark("anna", { species: ["Citrus limon"] });
    expect(r).toMatchObject({ ok: false, error: { code: "pokedex.not_caught" } });
    expect(await seen.find("ben")).toBeNull();
  });

  it("US-POK-12 refuses invalid input and writes nothing", async () => {
    for (const input of [{}, { species: "Aloe vera" }, { species: [1] }, { species: [""] }]) {
      expect(await mark("anna", input)).toMatchObject({
        ok: false,
        error: { code: "input.invalid" },
      });
    }
    expect(seen.writes).toBe(0);
  });

  it("US-POK-12 the same Idempotency-Key writes once", async () => {
    await catchSpecies("anna", LEMON);
    await mark("anna", { species: ["Citrus limon"] }, "same");
    await mark("anna", { species: ["Citrus limon"] }, "same");
    expect(seen.writes).toBe(1);
  });
});
