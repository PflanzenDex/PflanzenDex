import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryLight } from "../../light/test-helpers";
import { zoneDistribution, type DistributionDependencies } from "../index";
import { SpeciesStub, InMemorySpecimens, testSpecies } from "../shared/test-helpers";

const SPECIES_LOW = "11111111-1111-4111-8111-111111111111"; // 15.000 Lux, Stufe 2: Lampe 2
const SPECIES_HIGH = "22222222-2222-4222-8222-222222222222"; // 40.000 Lux, Stufe 3: Lampe 3
const SPECIES_SOFT = "33333333-3333-4333-8333-333333333333"; // 100.000 Lux, soft leaf: stays in Lampe 2
const SPECIES_FOREIGN = "99999999-9999-4999-8999-999999999999"; // visible only to ben

const light = new InMemoryLight();
const species = new SpeciesStub([
  { species: testSpecies(SPECIES_LOW, { lightDemandLux: 15000, standardLevel: 2 }) },
  { species: testSpecies(SPECIES_HIGH, { lightDemandLux: 40000, standardLevel: 3 }) },
  { species: testSpecies(SPECIES_FOREIGN), only: "ben" },
  {
    species: testSpecies(SPECIES_SOFT, {
      lightDemandLux: 100_000,
      standardLevel: 2,
      softLeaf: true,
    }),
  },
]);
let specimens: InMemorySpecimens;
let n = 0;
const zoneId: Record<string, string> = {};
const locationId: Record<string, string> = {};

const deps = (): DistributionDependencies => ({
  specimens,
  species,
  locations: light.locationAdapter(),
  zones: light.zoneAdapter(),
});

const zoneCreate = async (userId: string, names: readonly string[]) => {
  const luxCover = [1_500, 15_000, 100_000, 110_000];
  for (const [i, name] of names.entries()) {
    const z = await light
      .zoneAdapter()
      .create(userId, { name, luxCeiling: luxCover[i] ?? 1, ppfd: null, sortOrder: null });
    if (typeof z === "string") throw new Error(z);
    zoneId[`${userId}:${name}`] = z.id;
  }
};
const location = async (userId: string, name: string, zone: string | null) => {
  const s = await light.locationAdapter().create(userId, {
    name,
    lightZoneId: zone === null ? null : (zoneId[`${userId}:${zone}`] ?? null),
    kind: "indoor",
  });
  if (typeof s === "string") throw new Error(s);
  locationId[`${userId}:${name}`] = s.id;
};
type Status = "plant" | "cutting" | "archived";
const create = async (
  userId: string,
  place: string | null,
  extra: { speciesId?: string; status?: Status } = {},
) => {
  n += 1;
  const r = await specimens.create(userId, {
    speciesId: extra.speciesId ?? SPECIES_LOW,
    name: `Pflanze ${n}`,
    marker: null,
    locationId: place === null ? null : (locationId[`${userId}:${place}`] ?? null),
    caughtAt: null,
  });
  if (typeof r === "string") throw new Error(r);
  const i = specimens.rows.findIndex((z) => z.id === r.id);
  const row = specimens.rows[i];
  if (extra.status && row) specimens.rows[i] = { ...row, status: extra.status };
};
const counts = async (userId: string) =>
  (await zoneDistribution(deps(), userId)).zones.map((z) => [z.zone.name, z.count]);

beforeEach(async () => {
  light.zones.length = 0;
  light.locations.length = 0;
  n = 0;
  await zoneCreate("anna", ["Lampe 1", "Lampe 2", "Lampe 3", "Lampe 4"]);
  await location("anna", "Steckling-Ecke", "Lampe 1");
  await location("anna", "Fensterbank", "Lampe 2");
  await location("anna", "Regal", "Lampe 3");
  await location("anna", "Wüstenbank", "Lampe 4");
  await location("anna", "Kiste", null);
  specimens = new InMemorySpecimens({
    anna: Object.entries(locationId)
      .filter(([k]) => k.startsWith("anna:"))
      .map(([, id]) => id),
    ben: [],
  });
});

describe("US-LIC-02 count per zone 2 to 4 at specimen level", () => {
  it("counts the specimens per zone 2 to 4 in the order of the zones, also zones with zero", async () => {
    await create("anna", "Fensterbank");
    await create("anna", "Regal");
    await create("anna", "Regal");
    expect(await counts("anna")).toEqual([
      ["Lampe 2", 1],
      ["Lampe 3", 2],
      ["Lampe 4", 0],
    ]);
  });

  it("the zone of the specimen (via its location) takes precedence over the zone of the species", async () => {
    // The species belongs to lamp 2, but the specimen stands under lamp 4.
    await create("anna", "Wüstenbank", { speciesId: SPECIES_LOW });
    expect(await counts("anna")).toEqual([
      ["Lampe 2", 0],
      ["Lampe 3", 0],
      ["Lampe 4", 1],
    ]);
  });

  it("without a zone on the specimen the zone of the species derived from the lux need applies", async () => {
    await create("anna", null, { speciesId: SPECIES_LOW });
    await create("anna", "Kiste", { speciesId: SPECIES_HIGH }); // Standort ohne Zone
    expect(await counts("anna")).toEqual([
      ["Lampe 2", 1],
      ["Lampe 3", 1],
      ["Lampe 4", 0],
    ]);
  });

  it("US-LIC-01: Given a species marked soft-leaved C3, when its zone is derived, then it is not promoted by its lux need", async () => {
    await create("anna", "Kiste", { speciesId: SPECIES_SOFT });
    expect(await counts("anna")).toEqual([
      ["Lampe 2", 1],
      ["Lampe 3", 0],
      ["Lampe 4", 0],
    ]);
  });

  it("cutting light does not count: status cutting and location in the lowest zone", async () => {
    await create("anna", "Fensterbank", { status: "cutting" });
    await create("anna", "Steckling-Ecke");
    const v = await zoneDistribution(deps(), "anna");
    expect(v.zones.map((z) => z.count)).toEqual([0, 0, 0]);
    expect(v.notCounted.cuttingLight).toBe(2);
  });

  it("archived specimens do not count and are reported (nothing disappears silently)", async () => {
    await create("anna", "Regal", { status: "archived" });
    const v = await zoneDistribution(deps(), "anna");
    expect(v.zones.map((z) => z.count)).toEqual([0, 0, 0]);
    expect(v.notCounted.archived).toBe(1);
  });

  it('a specimen whose species is not readable and that has no zone is called "zone unknown" (P-08)', async () => {
    await create("anna", null, { speciesId: SPECIES_FOREIGN });
    const v = await zoneDistribution(deps(), "anna");
    expect(v.zones.map((z) => z.count)).toEqual([0, 0, 0]);
    expect(v.notCounted.zoneUnknown).toBe(1);
  });
});

describe("US-LIC-02 thinnest zone and tie", () => {
  it("names the thinnest zone and says what to do next (P-09)", async () => {
    await create("anna", "Fensterbank");
    await create("anna", "Fensterbank");
    await create("anna", "Regal");
    await create("anna", "Regal");
    await create("anna", "Wüstenbank");
    const v = await zoneDistribution(deps(), "anna");
    expect(v.thinnest.map((z) => z.name)).toEqual(["Lampe 4"]);
    expect(v.hint.text).toContain("Zone 4");
    expect(v.hint.nextAction).not.toBe("");
  });

  it("with a tie it names all tied ones and points to the wishlist", async () => {
    await create("anna", "Fensterbank");
    await create("anna", "Fensterbank");
    await create("anna", "Regal");
    await create("anna", "Wüstenbank");
    const v = await zoneDistribution(deps(), "anna");
    expect(v.thinnest.map((z) => z.name)).toEqual(["Lampe 3", "Lampe 4"]);
    expect(v.hint.text).toContain("Zone 3 und Zone 4");
    expect(v.hint.nextAction).toContain("Wunschliste");
    expect(v.hint.nextAction).toContain("eigene Lichtzone"); // US-LIC-02, P-09: names the second way as well
  });

  it("with a tie of all three zones all three are in the list", async () => {
    await create("anna", "Fensterbank");
    await create("anna", "Regal");
    await create("anna", "Wüstenbank");
    const v = await zoneDistribution(deps(), "anna");
    expect(v.thinnest.map((z) => z.name)).toEqual(["Lampe 2", "Lampe 3", "Lampe 4"]);
    expect(v.hint.text).toContain("Zone 2, Zone 3 und Zone 4");
    expect(v.hint.nextAction).toContain("Wunschliste");
  });

  it("without counted specimens there is no thinnest zone, but a hint to the next specimen", async () => {
    const v = await zoneDistribution(deps(), "anna");
    expect(v.thinnest).toEqual([]);
    expect(v.hint.text).toContain("Noch keine Pflanze");
    expect(v.hint.nextAction).toContain("Pflanze");
  });

  it("without zones for adults (fewer than two light zones) the hint says to create zones", async () => {
    await zoneCreate("carla", ["Einzige Lampe"]);
    const v = await zoneDistribution(deps(), "carla");
    expect(v.zones).toEqual([]);
    expect(v.thinnest).toEqual([]);
    expect(v.hint.nextAction).toContain("Lichtzone");
  });
});

describe("US-LIC-02 tenant: only own specimens and zones", () => {
  it("counts only the specimens of the asking account and knows no foreign zones", async () => {
    await zoneCreate("ben", ["Bens 1", "Bens 2", "Bens 3"]);
    await location("ben", "Bens Regal", "Bens 3");
    specimens = new InMemorySpecimens({
      anna: [locationId["anna:Regal"] as string],
      ben: [locationId["ben:Bens Regal"] as string],
    });
    await create("anna", "Regal");
    await create("ben", "Bens Regal");
    await create("ben", "Bens Regal");
    expect(await counts("anna")).toEqual([
      ["Lampe 2", 0],
      ["Lampe 3", 1],
      ["Lampe 4", 0],
    ]);
    expect(await counts("ben")).toEqual([
      ["Bens 2", 0],
      ["Bens 3", 2],
    ]);
  });
});

/** Sets the own light zone of the last specimen created (US-LIC-02), as the operation would. */
const own = (zoneName: string, userId = "anna") => {
  const i = specimens.rows.length - 1;
  const row = specimens.rows[i];
  if (row) specimens.rows[i] = { ...row, lightZoneId: zoneId[`${userId}:${zoneName}`] ?? null };
};

describe("US-LIC-02 / US-BES-04 own light zone of the specimen", () => {
  it("US-LIC-02: Given a specimen with its own zone, when the distribution is counted, then the own zone beats location and species", async () => {
    await create("anna", "Fensterbank", { speciesId: SPECIES_LOW }); // location and species say lamp 2
    own("Lampe 4");
    expect(await counts("anna")).toEqual([
      ["Lampe 2", 0],
      ["Lampe 3", 0],
      ["Lampe 4", 1],
    ]);
  });

  it("US-LIC-02: Given a specimen without a location and with its own zone, when counted, then it counts there instead of the species zone", async () => {
    await create("anna", null, { speciesId: SPECIES_LOW });
    own("Lampe 3");
    expect(await counts("anna")).toEqual([
      ["Lampe 2", 0],
      ["Lampe 3", 1],
      ["Lampe 4", 0],
    ]);
  });

  it("US-BES-04: a cutting stays under cutting light even with an own zone, an archived specimen does not count", async () => {
    await create("anna", null, { status: "cutting" });
    own("Lampe 4");
    await create("anna", null, { status: "archived" });
    own("Lampe 4");
    const v = await zoneDistribution(deps(), "anna");
    expect(v.zones.map((z) => z.count)).toEqual([0, 0, 0]);
    expect(v.notCounted).toMatchObject({ cuttingLight: 1, archived: 1 });
  });

  it("US-LIC-02 (P-04): a zone of another account on the row is not found among the own zones and does not count", async () => {
    await zoneCreate("ben", ["Bens 1", "Bens 2"]);
    await create("anna", null, { speciesId: SPECIES_LOW });
    own("Bens 2", "ben");
    expect(await counts("anna")).toEqual([
      ["Lampe 2", 1], // falls back to the species zone
      ["Lampe 3", 0],
      ["Lampe 4", 0],
    ]);
  });
});
