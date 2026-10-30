// US-LIC-03: light overview with position recommendations.
import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryLight } from "../../light/test-helpers";
import { lightOverview } from "./light-overview";
import { difficultyOverview } from "./difficulty-overview";
import { effectiveZone } from "../placement/effective-zone";
import { InMemorySpecimens, SpeciesStub, testSpecies } from "../shared/test-helpers";

const SP_LOW = "11111111-1111-4111-8111-111111111111";
const SP_MID = "22222222-2222-4222-8222-222222222222";
const SP_HIGH = "33333333-3333-4333-8333-333333333333";
const SP_FOREIGN = "99999999-9999-4999-8999-999999999999"; // visible only to ben
const SP_UNKNOWN = "44444444-4444-4444-8444-444444444444"; // catalog knows no light need (P-08, #1003)

const species = new SpeciesStub([
  { species: testSpecies(SP_LOW, { latinName: "Low", lightDemandLux: 3_999 }) },
  { species: testSpecies(SP_MID, { latinName: "Mid", lightDemandLux: 15_000 }) },
  {
    species: testSpecies(SP_HIGH, { latinName: "High", lightDemandLux: 80_000, standardLevel: 3 }),
  },
  { species: testSpecies(SP_FOREIGN, { latinName: "Bens", lightDemandLux: 9_000 }), only: "ben" },
  {
    species: testSpecies(SP_UNKNOWN, {
      latinName: "Unknown",
      lightDemandLux: null,
      standardLevel: null,
      difficulty: null,
    }),
  },
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
const overview = async (userId: string) => (await lightOverview(deps(), userId)).rows;

beforeEach(async () => {
  light.zones.length = 0;
  n = 0;
  specimens = new InMemorySpecimens();
  await zones("anna", ["Lampe 1", "Lampe 2", "Lampe 3", "Lampe 4"]);
});

describe("US-LIC-03: light overview", () => {
  it("has no rows without specimens", async () => {
    expect(await overview("anna")).toEqual([]);
  });

  it("lists one row per species, however many specimens it has", async () => {
    await plant("anna", SP_MID);
    await plant("anna", SP_MID);
    expect(await overview("anna")).toHaveLength(1);
  });

  it("sorts descending by lux demand, whatever the order of the specimens", async () => {
    await plant("anna", SP_LOW);
    await plant("anna", SP_HIGH);
    await plant("anna", SP_MID);
    expect((await overview("anna")).map((r) => r.lightDemandLux)).toEqual([80_000, 15_000, 3_999]);
  });

  it("maps the position and uses the latin name and the derived zone", async () => {
    await plant("anna", SP_HIGH);
    await plant("anna", SP_LOW);
    const [high, low] = await overview("anna");
    expect(high).toMatchObject({
      speciesName: "High",
      position: { category: "directly_under_lamp" },
      zone: { name: "Lampe 4" },
    });
    expect(low).toMatchObject({
      position: { category: "further_away" },
      zone: { name: "Lampe 2" },
    });
  });

  it("skips archived specimens", async () => {
    await plant("anna", SP_MID, "archived");
    expect(await overview("anna")).toEqual([]);
  });

  it("an archived specimen does not hide an active one of the same species", async () => {
    await plant("anna", SP_MID, "archived");
    await plant("anna", SP_MID);
    expect(await overview("anna")).toHaveLength(1);
  });

  it("shows the zone as unknown (null) when the account has no adult zone (P-08)", async () => {
    light.zones.length = 0;
    await zones("anna", ["Lampe 1"]);
    await plant("anna", SP_MID);
    const [row] = await overview("anna");
    expect(row?.zone).toBeNull();
    expect(row?.position?.category).toBe("very_close");
  });

  it("skips a species that the account cannot read", async () => {
    await plant("anna", SP_FOREIGN);
    expect(await overview("anna")).toEqual([]);
  });
});

describe("US-LIC-03 tenant: only own specimens and zones", () => {
  it("lists only the specimens of the asking account and uses only its zones", async () => {
    await zones("ben", ["Bens 1", "Bens 2"]);
    await plant("anna", SP_MID);
    await plant("ben", SP_FOREIGN);
    await plant("ben", SP_HIGH);
    expect((await overview("anna")).map((r) => [r.speciesName, r.zone?.name])).toEqual([
      ["Mid", "Lampe 2"],
    ]);
    expect((await overview("ben")).map((r) => [r.speciesName, r.zone?.name])).toEqual([
      ["High", "Bens 2"],
      ["Bens", "Bens 2"],
    ]);
  });
});

describe("US-LIC-03 adjustable thresholds (FR-LIC-05)", () => {
  it("uses the thresholds of the keeper for the position, the standard values without", async () => {
    await plant("anna", SP_MID);
    expect((await overview("anna"))[0]?.position?.category).toBe("very_close");
    const own = (await lightOverview(deps(), "anna", [100_000, 30_000, 20_000, 10_000])).rows;
    expect(own[0]?.position?.category).toBe("medium_distance");
  });
});

describe("US-LIC-01 P-08: a species without a light value is unknown in every derivation (#1003)", () => {
  it("US-LIC-01: Given a species with unknown lux need and level, then light overview, difficulty comparison and effective zone say unknown, never a guessed zone", async () => {
    await plant("anna", SP_MID);
    await plant("anna", SP_UNKNOWN);
    // Light overview: listed last, no lux, no position, zone unknown (not dropped, P-10).
    const rows = await overview("anna");
    expect(rows.map((r) => [r.speciesName, r.lightDemandLux, r.position, r.zone])).toEqual([
      ["Mid", 15_000, expect.anything(), expect.anything()],
      ["Unknown", null, null, null],
    ]);
    // Difficulty comparison: zone and difficulty unknown, sorted after every known difficulty.
    const cmp = await difficultyOverview(deps(), "anna");
    expect(cmp.rows.map((r) => [r.botanicalName, r.difficulty, r.zone, r.zoneSource])).toEqual([
      ["Mid", 1, expect.anything(), "species"],
      ["Unknown", null, null, null],
    ]);
    // Effective zone of the specimen (card and distribution): no zone from the species.
    const row = specimens.rows.find((z) => z.speciesId === SP_UNKNOWN);
    if (!row) throw new Error("no specimen");
    const unknown = await species.findMany("anna", [SP_UNKNOWN]);
    const ctx = {
      zones: light.listZones("anna"),
      locations: [],
      species: new Map([[SP_UNKNOWN, unknown[0] ?? null]]),
      overrides: new Map<string, string>(),
    };
    expect(effectiveZone(row, ctx)).toBeNull();
  });

  it("US-LIC-01: Given a known lux need but an unknown default level, then the zone stays unknown", async () => {
    await plant("anna", SP_UNKNOWN);
    const lux = testSpecies(SP_UNKNOWN, { lightDemandLux: 20_000, standardLevel: null });
    const row = specimens.rows[0];
    if (!row) throw new Error("no specimen");
    const ctx = {
      zones: light.listZones("anna"),
      locations: [],
      species: new Map([[SP_UNKNOWN, lux]]),
      overrides: new Map<string, string>(),
    };
    expect(effectiveZone(row, ctx)).toBeNull();
  });
});
