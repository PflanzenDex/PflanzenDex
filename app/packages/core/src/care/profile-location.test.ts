import { beforeEach, describe, expect, it } from "vitest";
import { execute } from "../kernel";
import { InMemoryIdempotencyStore } from "../kernel/test-helpers";
import { InMemoryLight } from "../light/test-helpers";
import { careProfileUpdate, specimenCreate, specimenHints } from "../collection";
import { InMemoryCareProfiles } from "../collection/care-profile-test-helpers";
import { InMemorySpecimens, SpeciesStub, testSpecies } from "../collection/test-helpers";
import {
  carePhasesList,
  careProfileLocations,
  careProfileTargetLocation,
  phaseSwitchConfirm,
} from "./index";

const WINTER = "11111111-1111-4111-8111-111111111111"; // catalog dormancy 11-01 to 03-15
const NONE = "22222222-2222-4222-8222-222222222222"; // no dormancy period in the catalog
const LIVING = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const COLD = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BEN_SPOT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const species = new SpeciesStub([
  {
    species: testSpecies(WINTER, {
      germanName: "Bogenhanf",
      dormancyFrom: "11-01",
      dormancyUntil: "03-15",
    }),
  },
  { species: testSpecies(NONE, { germanName: "Efeutute" }) },
]);
const OCTOBER = "2026-10-04T12:00:00Z"; // growth phase by the catalog
const DECEMBER = "2026-12-01T12:00:00Z"; // dormancy by the catalog

let profiles: InMemoryCareProfiles;
let specimens: InMemorySpecimens;
let idem: InMemoryIdempotencyStore;
let counter = 0;

const deps = (now: string) => ({
  specimens,
  species,
  profiles,
  targets: careProfileLocations(profiles),
  clock: () => new Date(now),
});
const profile = (userId: string, speciesId: string, input: Record<string, unknown>) =>
  execute(
    careProfileUpdate({ profiles, species }),
    { idempotency: idem },
    { context: { userId }, input: { speciesId, ...input }, idempotencyKey: `p${++counter}` },
  );
const add = async (userId: string, speciesId: string, name: string, locationId: string | null) => {
  const r = await specimens.create(userId, {
    speciesId,
    name,
    marker: null,
    locationId,
    caughtAt: "2026-09-01",
  });
  if (typeof r === "string") throw new Error(r);
  return r;
};
const list = async (userId: string, now: string) => {
  const r = await carePhasesList(deps(now), userId, "UTC");
  return r.ok ? r.value : [];
};

beforeEach(() => {
  specimens = new InMemorySpecimens({ anna: [LIVING, COLD], ben: [BEN_SPOT] });
  profiles = new InMemoryCareProfiles({
    anna: { locations: [LIVING, COLD] },
    ben: { locations: [BEN_SPOT] },
  });
  idem = new InMemoryIdempotencyStore();
});

describe("US-BES-09 the care profile feeds the port PhaseLocationSource (FR-PHA-02)", () => {
  it("US-BES-09 returns the location the keeper selected for the phase, otherwise unknown (P-08)", async () => {
    await profile("anna", WINTER, { growthLocationId: LIVING });
    const source = careProfileLocations(profiles);
    expect(await source.phaseLocation("anna", WINTER, "growth")).toBe(LIVING);
    expect(await source.phaseLocation("anna", WINTER, "dormancy")).toBeNull();
    expect(await source.phaseLocation("anna", NONE, "growth")).toBeNull();
  });

  it("US-BES-09 never answers with the location of another account (P-04, P-05)", async () => {
    await profile("ben", WINTER, { growthLocationId: BEN_SPOT, dormancyLocationId: BEN_SPOT });
    const source = careProfileLocations(profiles);
    expect(await source.phaseLocation("anna", WINTER, "growth")).toBeNull();
    expect(await source.phaseLocation("ben", WINTER, "dormancy")).toBe(BEN_SPOT);
  });

  it("US-BES-09 resetting a location to the catalog makes the target unknown again", async () => {
    await profile("anna", WINTER, { growthLocationId: LIVING });
    await profile("anna", WINTER, { growthLocationId: null });
    expect(await careProfileLocations(profiles).phaseLocation("anna", WINTER, "growth")).toBeNull();
  });
});

describe("US-BES-09 the care profile feeds the port TargetLocationSource (FR-PHA-05)", () => {
  it("US-BES-09 the target of today follows the effective phase, the growth location is always the growth one", async () => {
    await profile("anna", WINTER, { growthLocationId: LIVING, dormancyLocationId: COLD });
    const target = careProfileTargetLocation(profiles);
    const winter = testSpecies(WINTER, { dormancyFrom: "11-01", dormancyUntil: "03-15" });
    expect(await target.targetLocation("anna", winter, "2026-10-04")).toBe(LIVING);
    expect(await target.targetLocation("anna", winter, "2026-12-01")).toBe(COLD);
    expect(await target.growthLocation("anna", winter)).toBe(LIVING);
  });

  it("US-BES-09 a species without a dormancy period always counts as growth; a dormancy override moves the day", async () => {
    await profile("anna", NONE, { growthLocationId: LIVING, dormancyLocationId: COLD });
    const target = careProfileTargetLocation(profiles);
    const plain = testSpecies(NONE);
    expect(await target.targetLocation("anna", plain, "2026-12-01")).toBe(LIVING);
    await profile("anna", NONE, { dormancyFrom: "11-01", dormancyUntil: "03-15" });
    expect(await target.targetLocation("anna", plain, "2026-12-01")).toBe(COLD);
  });

  it("US-BES-09 nothing is invented without a profile or for another account", async () => {
    await profile("ben", WINTER, { growthLocationId: BEN_SPOT });
    const target = careProfileTargetLocation(profiles);
    const winter = testSpecies(WINTER);
    expect(await target.targetLocation("anna", winter, "2026-10-04")).toBeNull();
    expect(await target.growthLocation("anna", winter)).toBeNull();
  });

  it("US-BES-09 a new specimen of the species is placed at the target location of the profile (US-BES-02)", async () => {
    await profile("anna", WINTER, { growthLocationId: LIVING });
    const create = specimenCreate({
      specimens,
      species,
      targetLocation: careProfileTargetLocation(profiles),
      clock: () => new Date(OCTOBER),
    });
    const r = await execute(
      create,
      { idempotency: idem },
      {
        context: { userId: "anna" },
        input: { speciesId: WINTER, timeZone: "UTC" },
        idempotencyKey: "create",
      },
    );
    expect(r.ok && r.value).toMatchObject({ locationId: LIVING });
  });
});

describe("US-BES-09 dormancy override changes the phase (FR-PHA-01)", () => {
  it("US-BES-09 my own dormancy period replaces the catalog's: the same day is another phase", async () => {
    await add("anna", WINTER, "Bogenhanf", null);
    expect((await list("anna", OCTOBER)).map((r) => r.phase)).toEqual(["growth"]);
    await profile("anna", WINTER, { dormancyFrom: "09-01", dormancyUntil: "11-30" });
    expect((await list("anna", OCTOBER)).map((r) => r.phase)).toEqual(["dormancy"]);
    await profile("anna", WINTER, { dormancyFrom: null, dormancyUntil: null });
    expect((await list("anna", OCTOBER)).map((r) => r.phase)).toEqual(["growth"]);
  });

  it("US-BES-09 a species without catalog dormancy is listed once I gave it a period", async () => {
    await add("anna", NONE, "Efeutute", null);
    expect(await list("anna", DECEMBER)).toEqual([]);
    await profile("anna", NONE, { dormancyFrom: "11-01", dormancyUntil: "03-15" });
    expect((await list("anna", DECEMBER)).map((r) => [r.name, r.phase])).toEqual([
      ["Efeutute", "dormancy"],
    ]);
  });

  it("US-BES-09 another account's dormancy override does not touch my phases (P-05)", async () => {
    await add("anna", WINTER, "Bogenhanf", null);
    await add("ben", WINTER, "Bogenhanf", null);
    await profile("ben", WINTER, { dormancyFrom: "09-01", dormancyUntil: "11-30" });
    expect((await list("anna", OCTOBER)).map((r) => r.phase)).toEqual(["growth"]);
    expect((await list("ben", OCTOBER)).map((r) => r.phase)).toEqual(["dormancy"]);
  });
});

describe("US-BES-09 end to end: adjust profile, target shows in the phase list, move, hint is gone", () => {
  it("US-BES-09 the phase list shows the target of the profile, 'Jetzt umgestellt' moves, the hint 'location missing' disappears (BES-08, PHA-03)", async () => {
    const light = new InMemoryLight();
    const made = await light
      .locationAdapter()
      .create("anna", { name: "Wohnzimmer", lightZoneId: null, kind: "indoor" });
    const place = typeof made === "string" ? "" : made.id;
    specimens = new InMemorySpecimens({ anna: [place] });
    profiles = new InMemoryCareProfiles({ anna: { locations: [place] } });
    const z = await add("anna", WINTER, "Bogenhanf", null);
    const hints = () =>
      specimenHints({ specimens, species, locations: light.locationAdapter() }, "anna").then((h) =>
        h.map((x) => x.kind),
      );
    expect(await list("anna", OCTOBER)).toMatchObject([{ targetLocationId: null }]);
    expect(await hints()).toContain("location_missing");

    await profile("anna", WINTER, { growthLocationId: place });
    expect(await list("anna", OCTOBER)).toMatchObject([
      { specimenId: z.id, locationId: null, targetLocationId: place },
    ]);

    const moved = await execute(
      phaseSwitchConfirm({ ...deps(OCTOBER) }),
      { idempotency: idem },
      {
        context: { userId: "anna" },
        input: { specimenIds: [z.id], timeZone: "UTC" },
        idempotencyKey: "switch",
      },
    );
    expect(moved.ok && moved.value.specimens).toEqual([
      { specimenId: z.id, locationId: place, changed: true },
    ]);
    expect(await list("anna", OCTOBER)).toMatchObject([
      { locationId: place, targetLocationId: place },
    ]);
    expect(await hints()).not.toContain("location_missing");
  });

  it("US-BES-09 without a profile 'Jetzt umgestellt' stays refused: no target is invented (P-08)", async () => {
    const z = await add("anna", WINTER, "Bogenhanf", null);
    const r = await execute(
      phaseSwitchConfirm(deps(OCTOBER)),
      { idempotency: idem },
      {
        context: { userId: "anna" },
        input: { specimenIds: [z.id], timeZone: "UTC" },
        idempotencyKey: "refused",
      },
    );
    expect(!r.ok && r.error.code).toBe("care.target_unknown");
  });
});
