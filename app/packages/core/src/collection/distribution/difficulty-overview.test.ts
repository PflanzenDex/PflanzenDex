// US-BES-05: species compared by difficulty.
import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryLight } from "../../light/test-helpers";
import { difficultyOverview } from "./difficulty-overview";
import { InMemorySpecimens, SpeciesStub, testSpecies } from "../shared/test-helpers";

const SP_EASY = "11111111-1111-4111-8111-111111111111";
const SP_MEDIUM = "22222222-2222-4222-8222-222222222222";
const SP_HARD = "33333333-3333-4333-8333-333333333333";
const SP_HARD_A = "44444444-4444-4444-8444-444444444444";
const SP_FOREIGN = "99999999-9999-4999-8999-999999999999"; // visible only to ben

const species = new SpeciesStub([
  {
    species: testSpecies(SP_EASY, {
      latinName: "Easy plant",
      germanName: "Leicht",
      difficulty: 1,
      lightDemandLux: 15_000,
      wateringHint: "alle 10 Tage",
      substrate: "Humus",
      pruning: "selten",
      successCriteria: "Neue Blätter.",
    }),
  },
  {
    species: testSpecies(SP_MEDIUM, {
      latinName: "Medium plant",
      germanName: null,
      difficulty: 2,
      lightDemandLux: 80_000,
      standardLevel: 3,
    }),
  },
  { species: testSpecies(SP_HARD, { latinName: "Zed hard", germanName: null, difficulty: 3 }) },
  { species: testSpecies(SP_HARD_A, { latinName: "Abe hard", germanName: null, difficulty: 3 }) },
  { species: testSpecies(SP_FOREIGN, { latinName: "Bens", difficulty: 1 }), only: "ben" },
]);

const light = new InMemoryLight();
let specimens: InMemorySpecimens;
let n = 0;

const deps = () => ({ specimens, species, zones: light.zoneAdapter() });
const zones = async (userId: string, names: readonly string[]) => {
  const ceilings = [1_500, 15_000, 100_000, 110_000];
  for (const [i, name] of names.entries())
    await light
      .zoneAdapter()
      .create(userId, { name, luxCeiling: ceilings[i] ?? 1, ppfd: null, sortOrder: null });
};
const plant = async (userId: string, speciesId: string, status?: "archived") => {
  n += 1;
  const r = await specimens.create(userId, {
    speciesId,
    name: `Pflanze ${n}`,
    marker: null,
    locationId: null,
    caughtAt: null,
  });
  if (typeof r === "string") throw new Error(r);
  const i = specimens.rows.findIndex((z) => z.id === r.id);
  const row = specimens.rows[i];
  if (status && row) specimens.rows[i] = { ...row, status };
};
const rows = async (userId: string) => (await difficultyOverview(deps(), userId)).rows;

beforeEach(async () => {
  light.zones.length = 0;
  n = 0;
  specimens = new InMemorySpecimens();
  await zones("anna", ["Lampe 1", "Lampe 2", "Lampe 3", "Lampe 4"]);
});

describe("US-BES-05: difficulty overview", () => {
  it("has no rows without specimens", async () => {
    expect(await rows("anna")).toEqual([]);
  });

  it("lists one row per species, however many specimens it has", async () => {
    await plant("anna", SP_EASY);
    await plant("anna", SP_EASY);
    expect(await rows("anna")).toHaveLength(1);
  });

  it("sorts by difficulty ascending, ties by name, whatever the order of the specimens", async () => {
    await plant("anna", SP_HARD);
    await plant("anna", SP_MEDIUM);
    await plant("anna", SP_HARD_A);
    await plant("anna", SP_EASY);
    expect((await rows("anna")).map((r) => [r.difficulty, r.botanicalName])).toEqual([
      [1, "Easy plant"],
      [2, "Medium plant"],
      [3, "Abe hard"],
      [3, "Zed hard"],
    ]);
  });

  it("carries the columns: species, botanical name, zone, watering, substrate, pruning, success", async () => {
    await plant("anna", SP_EASY);
    const [row] = await rows("anna");
    expect(row).toMatchObject({
      speciesId: SP_EASY,
      speciesName: "Leicht",
      botanicalName: "Easy plant",
      zone: { name: "Lampe 2" },
      wateringHint: "alle 10 Tage",
      substrate: "Humus",
      pruning: "selten",
      successCriteria: "Neue Blätter.",
      difficulty: 1,
    });
  });

  it("keeps unknown values as null instead of inventing them (P-08)", async () => {
    await plant("anna", SP_MEDIUM);
    const [row] = await rows("anna");
    expect(row).toMatchObject({ wateringHint: null, substrate: null, pruning: null });
  });

  it("shows the zone as unknown (null) when the account has no adult zone (P-08)", async () => {
    light.zones.length = 0;
    await zones("anna", ["Lampe 1"]);
    await plant("anna", SP_EASY);
    expect((await rows("anna"))[0]?.zone).toBeNull();
  });

  it("skips archived specimens, but an active one of the same species still counts", async () => {
    await plant("anna", SP_EASY, "archived");
    expect(await rows("anna")).toEqual([]);
    await plant("anna", SP_EASY);
    expect(await rows("anna")).toHaveLength(1);
  });

  it("skips a species that the account cannot read", async () => {
    await plant("anna", SP_FOREIGN);
    expect(await rows("anna")).toEqual([]);
  });

  it("US-BES-05 · P-10 counts the species it cannot read instead of dropping them silently", async () => {
    await plant("anna", SP_FOREIGN);
    await plant("anna", SP_FOREIGN);
    await plant("anna", SP_EASY);
    const overview = await difficultyOverview(deps(), "anna");
    expect(overview.rows).toHaveLength(1);
    expect(overview.unreadable).toBe(1);
  });
});

describe("US-BES-05 tenant: only own specimens and zones", () => {
  it("lists only the species of the asking account and uses only its zones", async () => {
    await zones("ben", ["Bens 1", "Bens 2"]);
    await plant("anna", SP_EASY);
    await plant("ben", SP_FOREIGN);
    await plant("ben", SP_HARD);
    expect((await rows("anna")).map((r) => [r.botanicalName, r.zone?.name])).toEqual([
      ["Easy plant", "Lampe 2"],
    ]);
    expect((await rows("ben")).map((r) => [r.botanicalName, r.zone?.name])).toEqual([
      ["Bens", "Bens 2"],
      ["Zed hard", "Bens 2"],
    ]);
  });
});
