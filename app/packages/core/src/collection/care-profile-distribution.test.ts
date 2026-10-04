import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryLight } from "../light/test-helpers";
import { zoneDistribution } from "./index";
import { InMemoryCareProfiles } from "./care-profile-test-helpers";
import { InMemorySpecimens, SpeciesStub, testSpecies } from "./test-helpers";

const SPECIES = "11111111-1111-4111-8111-111111111111"; // 15.000 Lux, level 2: derived zone "Lampe 2"
const light = new InMemoryLight();
const species = new SpeciesStub([
  { species: testSpecies(SPECIES, { lightDemandLux: 15000, standardLevel: 2 }) },
]);
let specimens: InMemorySpecimens;
let profiles: InMemoryCareProfiles;
let zoneId: Record<string, string>;

beforeEach(async () => {
  light.zones.length = 0;
  light.locations.length = 0;
  specimens = new InMemorySpecimens();
  zoneId = {};
  for (const [i, name] of ["Lampe 1", "Lampe 2", "Lampe 3", "Lampe 4"].entries()) {
    const z = await light.zoneAdapter().create("anna", {
      name,
      luxCeiling: [1_500, 15_000, 100_000, 110_000][i] ?? 1,
      ppfd: null,
      sortOrder: null,
    });
    zoneId[name] = typeof z === "string" ? "" : z.id;
  }
  profiles = new InMemoryCareProfiles({ anna: { zones: Object.values(zoneId) } });
  await specimens.create("anna", {
    speciesId: SPECIES,
    name: "Bogenhanf",
    marker: null,
    locationId: null,
    caughtAt: null,
  });
});

const counts = async (userId = "anna") =>
  (
    await zoneDistribution(
      {
        specimens,
        species,
        locations: light.locationAdapter(),
        zones: light.zoneAdapter(),
        profiles,
      },
      userId,
    )
  ).zones.map((z) => [z.zone.name, z.count]);

describe("US-BES-09 the zone override of my care profile takes precedence (FR-BES-10)", () => {
  it("US-BES-09 without a deviation the derived zone counts", async () => {
    expect(await counts()).toEqual([
      ["Lampe 2", 1],
      ["Lampe 3", 0],
      ["Lampe 4", 0],
    ]);
  });

  it("US-BES-09 with my zone for the species its specimens count there instead of the derived zone", async () => {
    await profiles.update("anna", SPECIES, { lightZoneId: zoneId["Lampe 4"] as string });
    expect(await counts()).toEqual([
      ["Lampe 2", 0],
      ["Lampe 3", 0],
      ["Lampe 4", 1],
    ]);
  });

  it("US-BES-09 resetting to the catalog brings the derived zone back", async () => {
    await profiles.update("anna", SPECIES, { lightZoneId: zoneId["Lampe 4"] as string });
    await profiles.update("anna", SPECIES, { lightZoneId: null });
    expect(await counts()).toEqual([
      ["Lampe 2", 1],
      ["Lampe 3", 0],
      ["Lampe 4", 0],
    ]);
  });

  it("US-BES-09 another account's override does not change my count (P-05)", async () => {
    await profiles.update("ben", SPECIES, { lightZoneId: zoneId["Lampe 4"] as string });
    expect(await counts()).toEqual([
      ["Lampe 2", 1],
      ["Lampe 3", 0],
      ["Lampe 4", 0],
    ]);
  });

  it("US-BES-09 an override on cutting light still counts as cutting light, never as a target (FR-LIC-02)", async () => {
    await profiles.update("anna", SPECIES, { lightZoneId: zoneId["Lampe 1"] as string });
    const d = await zoneDistribution(
      {
        specimens,
        species,
        locations: light.locationAdapter(),
        zones: light.zoneAdapter(),
        profiles,
      },
      "anna",
    );
    expect(d.notCounted.cuttingLight).toBe(1);
  });
});
