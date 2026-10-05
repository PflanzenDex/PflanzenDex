import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryLight } from "../../light/test-helpers";
import { specimenHints, zoneDistribution, type HintsDependencies } from "../index";
import { InMemorySpecimens, SpeciesStub, testSpecies } from "../shared/test-helpers";

const SPECIES = "11111111-1111-4111-8111-111111111111";
const SPECIES_FOREIGN = "99999999-9999-4999-8999-999999999999"; // visible only to ben

const light = new InMemoryLight();
const species = new SpeciesStub([
  { species: testSpecies(SPECIES) },
  { species: testSpecies(SPECIES_FOREIGN), only: "ben" },
]);
let specimens: InMemorySpecimens;
let n = 0;
const locationId: Record<string, string> = {};

const deps = (): HintsDependencies => ({
  specimens,
  species,
  locations: light.locationAdapter(),
});

const location = async (userId: string, name: string, withZone: boolean) => {
  let lightZoneId: string | null = null;
  if (withZone) {
    const z = await light
      .zoneAdapter()
      .create(userId, { name: `Zone ${name}`, luxCeiling: 15_000, ppfd: null, sortOrder: null });
    if (typeof z === "string") throw new Error(z);
    lightZoneId = z.id;
  }
  const s = await light.locationAdapter().create(userId, { name, lightZoneId, kind: "indoor" });
  if (typeof s === "string") throw new Error(s);
  locationId[`${userId}:${name}`] = s.id;
};
type Status = "plant" | "cutting" | "archived";
const create = async (
  userId: string,
  place: string | null,
  extra: { speciesId?: string; status?: Status; name?: string } = {},
) => {
  n += 1;
  const r = await specimens.create(userId, {
    speciesId: extra.speciesId ?? SPECIES,
    name: extra.name ?? `Pflanze ${n}`,
    marker: null,
    locationId: place === null ? null : (locationId[`${userId}:${place}`] ?? null),
    caughtAt: null,
  });
  if (typeof r === "string") throw new Error(r);
  const i = specimens.rows.findIndex((z) => z.id === r.id);
  const row = specimens.rows[i];
  if (extra.status && row) specimens.rows[i] = { ...row, status: extra.status };
  return r.id;
};
const hints = (userId: string) => specimenHints(deps(), userId);

beforeEach(async () => {
  light.zones.length = 0;
  light.locations.length = 0;
  n = 0;
  await location("anna", "Fensterbank", true);
  await location("anna", "Kiste", false);
  await location("ben", "Regal", true);
  specimens = new InMemorySpecimens({
    anna: [locationId["anna:Fensterbank"] ?? "", locationId["anna:Kiste"] ?? ""],
    ben: [locationId["ben:Regal"] ?? ""],
  });
});

describe("US-BES-08 incomplete specimens appear in the hints with the fixing action", () => {
  it("a complete specimen produces no hint", async () => {
    await create("anna", "Fensterbank");
    expect(await hints("anna")).toEqual([]);
  });

  it("a specimen without location is a hint 'location_missing' that names the action (P-09)", async () => {
    const id = await create("anna", null, { name: "Bogenhanf" });
    const h = await hints("anna");
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({
      kind: "location_missing",
      specimenId: id,
      specimenName: "Bogenhanf",
      locationId: null,
    });
    expect(h[0]?.text).toContain("Bogenhanf");
    expect(h[0]?.nextAction).toMatch(/Standort/);
  });

  it("a specimen in a location without light zone is a hint 'location_without_zone' naming the location", async () => {
    const id = await create("anna", "Kiste", { name: "Aloe" });
    const h = await hints("anna");
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({
      kind: "location_without_zone",
      specimenId: id,
      locationId: locationId["anna:Kiste"],
    });
    expect(h[0]?.text).toContain("Kiste");
    expect(h[0]?.nextAction).toMatch(/Lichtzone/);
  });

  it("a specimen whose species cannot be read is a hint 'species_missing' (never silently dropped, P-10)", async () => {
    const id = await create("anna", "Fensterbank", { speciesId: SPECIES_FOREIGN });
    const h = await hints("anna");
    expect(h.map((x) => [x.kind, x.specimenId])).toEqual([["species_missing", id]]);
    expect(h[0]?.nextAction).toMatch(/Art/);
  });

  it("one specimen can carry several hints (species and location)", async () => {
    await create("anna", null, { speciesId: SPECIES_FOREIGN });
    expect((await hints("anna")).map((x) => x.kind).sort()).toEqual([
      "location_missing",
      "species_missing",
    ]);
  });

  it("cuttings are checked like plants, archived specimens never appear (US-BES-07)", async () => {
    await create("anna", null, { status: "cutting", name: "Steckling" });
    await create("anna", null, { status: "archived", name: "Weg" });
    const h = await hints("anna");
    expect(h.map((x) => x.specimenName)).toEqual(["Steckling"]);
  });

  it("hints are sorted by specimen name", async () => {
    await create("anna", null, { name: "Zimmerlinde" });
    await create("anna", null, { name: "Aloe" });
    expect((await hints("anna")).map((x) => x.specimenName)).toEqual(["Aloe", "Zimmerlinde"]);
  });

  it("two accounts: one account sees only hints about its own specimens (P-04)", async () => {
    await create("anna", null, { name: "Annas Pflanze" });
    await create("ben", "Regal", { speciesId: SPECIES_FOREIGN, name: "Bens Pflanze" });
    expect((await hints("anna")).map((x) => x.specimenName)).toEqual(["Annas Pflanze"]);
    expect(await hints("ben")).toEqual([]);
    expect(await hints("carla")).toEqual([]);
  });
});

describe("US-BES-08 no evaluation hides an incomplete specimen silently", () => {
  it("the specimens the distribution reports as 'zone unknown' are a subset of those with a hint", async () => {
    await create("anna", null);
    await create("anna", "Kiste");
    await create("anna", "Fensterbank");
    const d = await zoneDistribution({ ...deps(), specimens, zones: light.zoneAdapter() }, "anna");
    const hinted = new Set((await hints("anna")).map((x) => x.specimenId));
    expect(hinted.size).toBe(2);
    expect(d.notCounted.zoneUnknown).toBeLessThanOrEqual(hinted.size);
  });
});
