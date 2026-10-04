import { beforeEach, describe, expect, it } from "vitest";
import type { LightZone } from "../light";
import { careProfileView, careProfileZoneUsage } from "./index";
import { InMemoryCareProfiles, zoneStore } from "./care-profile-test-helpers";
import { InMemorySpecimens, SpeciesStub, testSpecies } from "./test-helpers";

const BOGEN = "11111111-1111-4111-8111-111111111111";
const ALOE = "22222222-2222-4222-8222-222222222222";
const KAKTUS = "33333333-3333-4333-8333-333333333333";
const GEHEIM = "44444444-4444-4444-8444-444444444444";
const LOC = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const zone = (id: string, sortOrder: number, luxCeiling: number): LightZone => ({
  id,
  name: `Zone ${sortOrder + 1}`,
  luxCeiling,
  ppfd: null,
  sortOrder,
});
// Level 3 for a species with a low need: the derived catalog zone is Zone 3 (z3), see US-LIC-01.
const ZONES = [
  zone("z1", 0, 5000),
  zone("z2", 1, 15000),
  zone("z3", 2, 30000),
  zone("z4", 3, 60000),
];

const species = new SpeciesStub([
  {
    species: testSpecies(BOGEN, {
      germanName: "Bogenhanf",
      standardLevel: 3,
      lightDemandLux: 10000,
      dormancyFrom: "11-01",
      dormancyUntil: "03-15",
      wateringHint: "Alle zwei Wochen",
    }),
  },
  { species: testSpecies(ALOE, { germanName: "Aloe", standardLevel: 3, lightDemandLux: 10000 }) },
  { species: testSpecies(KAKTUS, { germanName: "Kaktus", lightDemandLux: 10000 }) },
  { species: testSpecies(GEHEIM, { germanName: "Geheim" }), only: "ben" },
]);

let specimens: InMemorySpecimens;
let profiles: InMemoryCareProfiles;
const create = async (userId: string, speciesId: string, name: string, archived = false) => {
  const r = await specimens.create(userId, {
    speciesId,
    name,
    marker: null,
    locationId: null,
    caughtAt: "2026-09-01",
  });
  if (typeof r === "string") throw new Error(r);
  if (archived) await specimens.archive(userId, r.id, "eingegangen", "2026-10-01");
  return r;
};
const view = (userId = "anna") =>
  careProfileView(
    { specimens, species, profiles, zones: zoneStore({ anna: ZONES, ben: ZONES }) },
    userId,
  );

beforeEach(() => {
  specimens = new InMemorySpecimens();
  profiles = new InMemoryCareProfiles({ anna: { locations: [LOC], zones: ["z2"] } });
});

describe("US-BES-09 care profile view: catalog value and my deviation side by side", () => {
  it("US-BES-09 lists every species with an active specimen, sorted by name, without a profile the catalog applies", async () => {
    await create("anna", BOGEN, "Bogenhanf");
    await create("anna", ALOE, "Aloe");
    const entries = await view();
    expect(entries.map((e) => e.speciesName)).toEqual(["Aloe", "Bogenhanf"]);
    expect(entries.every((e) => !e.deviates)).toBe(true);
    const bogen = entries[1];
    expect(bogen?.profile.dormancy).toMatchObject({
      catalog: { from: "11-01", until: "03-15" },
      own: null,
      source: "catalog",
    });
    expect(bogen?.profile.lightZone).toMatchObject({ catalog: "z3", own: null, source: "catalog" });
    expect(bogen?.wateringHint).toBe("Alle zwei Wochen");
  });

  it("US-BES-09 shows the catalog value and my deviation next to each other", async () => {
    await create("anna", BOGEN, "Bogenhanf");
    await profiles.update("anna", BOGEN, { lightZoneId: "z2", growthLocationId: LOC });
    const [entry] = await view();
    expect(entry?.deviates).toBe(true);
    expect(entry?.profile.lightZone).toEqual({
      catalog: "z3",
      own: "z2",
      effective: "z2",
      source: "profile",
    });
    expect(entry?.profile.growthLocation).toMatchObject({ own: LOC, source: "profile" });
  });

  it("US-BES-09 counts only active specimens; a species with only archived specimens drops out (US-BES-07)", async () => {
    await create("anna", BOGEN, "Bogenhanf");
    await create("anna", BOGEN, "Bogenhanf Zwei");
    await create("anna", ALOE, "Aloe", true);
    const entries = await view();
    expect(entries.map((e) => [e.speciesName, e.activeSpecimens])).toEqual([["Bogenhanf", 2]]);
  });

  it("US-BES-09 a species with a deviation stays listed without a specimen, so it can be reset (P-10)", async () => {
    await profiles.update("anna", KAKTUS, { wateringGrowthDays: 14 });
    const entries = await view();
    expect(entries.map((e) => [e.speciesName, e.activeSpecimens, e.deviates])).toEqual([
      ["Kaktus", 0, true],
    ]);
  });

  it("US-BES-09 a species the account cannot see is left out, also with a profile row (P-04)", async () => {
    await create("anna", BOGEN, "Bogenhanf");
    await profiles.update("anna", GEHEIM, { wateringGrowthDays: 14 });
    expect((await view()).map((e) => e.speciesName)).toEqual(["Bogenhanf"]);
  });

  it("US-BES-09 another account sees neither my specimens nor my deviations (P-04, P-05)", async () => {
    await create("anna", BOGEN, "Bogenhanf");
    await profiles.update("anna", BOGEN, { growthLocationId: LOC });
    expect(await view("ben")).toEqual([]);
  });

  it("US-BES-09 a species without lux need has no catalog zone: unknown, never invented (P-08)", async () => {
    const lonely = new SpeciesStub([{ species: testSpecies(ALOE, { germanName: "Aloe" }) }]);
    await create("anna", ALOE, "Aloe");
    const noZones = await careProfileView(
      { specimens, species: lonely, profiles, zones: zoneStore({}) },
      "anna",
    );
    expect(noZones[0]?.profile.lightZone).toMatchObject({ catalog: null, source: "unknown" });
  });
});

describe("US-BES-09 zone usage: a zone that a care profile points to is not deleted unnoticed", () => {
  it("US-BES-09 names the species whose profile uses the zone, only for the own account", async () => {
    await profiles.update("anna", BOGEN, { lightZoneId: "z2" });
    await profiles.update("anna", ALOE, { growthLocationId: LOC });
    const usage = careProfileZoneUsage({ profiles, species });
    expect(await usage.user("anna", "z2")).toEqual([
      { kind: "care_profile", id: BOGEN, name: "Bogenhanf" },
    ]);
    expect(await usage.user("anna", "z3")).toEqual([]);
    expect(await usage.user("ben", "z2")).toEqual([]);
  });
});

describe("US-BES-10 a care profile kept on a merged proposal does not vanish (FR-BES-11, P-10)", () => {
  const MERGED = "55555555-5555-4555-8555-555555555555";
  const merged = {
    async mergedInto(userId: string, id: string) {
      return userId === "anna" && id === MERGED
        ? { id: BOGEN, latinName: "Dracaena trifasciata" }
        : null;
    },
  };
  const withMerged = (userId = "anna") =>
    careProfileView(
      { specimens, species, profiles, zones: zoneStore({ anna: ZONES, ben: ZONES }), merged },
      userId,
    );

  it("US-BES-10 shows it with a notice naming the target species and the next action", async () => {
    await profiles.update("anna", MERGED, { ownHints: "Mein alter Hinweis" });
    const entries = await withMerged();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      speciesId: MERGED,
      mergedInto: { speciesId: BOGEN, speciesName: "Bogenhanf" },
      deviates: true,
    });
    expect(entries[0]?.profile.ownHints.own).toBe("Mein alter Hinweis");
    expect(entries[0]?.notice?.text).toContain("Bogenhanf");
    expect(entries[0]?.notice?.nextAction).toContain("Pflegeprofil");
  });

  it("US-BES-10 a profile of a species that is invisible and not merged stays hidden (P-04)", async () => {
    await profiles.update("ben", MERGED, { ownHints: "x" });
    expect(await withMerged("ben")).toEqual([]);
    expect(await view("ben")).toEqual([]);
  });

  it("US-BES-10 without the merge port an unknown species is skipped as before", async () => {
    await profiles.update("anna", MERGED, { ownHints: "x" });
    expect(await view()).toEqual([]);
  });

  it("US-BES-10 a merge target that is not visible to the account shows nothing", async () => {
    await profiles.update("anna", MERGED, { ownHints: "x" });
    const lost = { mergedInto: async () => ({ id: GEHEIM, latinName: "Geheim" }) };
    const entries = await careProfileView(
      { specimens, species, profiles, zones: zoneStore({ anna: ZONES }), merged: lost },
      "anna",
    );
    expect(entries).toEqual([]);
  });
});
