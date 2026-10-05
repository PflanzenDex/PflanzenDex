import { beforeEach, describe, expect, it } from "vitest";
import { execute } from "../kernel";
import { InMemoryIdempotencyStore } from "../kernel/test-helpers";
import { InMemoryLight } from "../light/test-helpers";
import { specimenHints } from "../collection";
import { InMemorySpecimens, SpeciesStub, testSpecies } from "../collection/shared/test-helpers";
import { carePhasesList, phaseSwitchConfirm } from "./index";
import { InMemoryCareProfiles } from "../collection/care-profile/care-profile-test-helpers";
import { PhaseLocationStub } from "./test-helpers";

const WINTER = "11111111-1111-4111-8111-111111111111"; // dormancy 11-01 to 03-15
const SUMMER = "22222222-2222-4222-8222-222222222222"; // dormancy 06-01 to 08-31
const WITHOUT = "33333333-3333-4333-8333-333333333333"; // no dormancy period
const LIVING = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const COLD = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SHADE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const BEN_SPOT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const UNKNOWN_ID = "99999999-9999-4999-8999-999999999999";

const species = new SpeciesStub([
  { species: testSpecies(WINTER, { dormancyFrom: "11-01", dormancyUntil: "03-15" }) },
  { species: testSpecies(SUMMER, { dormancyFrom: "06-01", dormancyUntil: "08-31" }) },
  { species: testSpecies(WITHOUT) },
]);
// Anna keeps both species in the living room in the growth phase and in the cold in dormancy.
const targets = new PhaseLocationStub({
  anna: {
    [WINTER]: { growth: LIVING, dormancy: COLD },
    [SUMMER]: { growth: LIVING, dormancy: SHADE },
    [WITHOUT]: { growth: LIVING, dormancy: LIVING },
  },
  ben: { [WINTER]: { growth: BEN_SPOT, dormancy: BEN_SPOT } },
});
const DECEMBER = "2026-12-01T12:00:00Z";
const JULY = "2026-07-01T12:00:00Z";

let specimens: InMemorySpecimens;
let idem: InMemoryIdempotencyStore;
let counter = 0;

const deps = (now: string, source: PhaseLocationStub = targets) => ({
  specimens,
  species,
  targets: source,
  profiles: new InMemoryCareProfiles(),
  clock: () => new Date(now),
});
const confirm = (
  ids: unknown,
  opt: {
    now?: string;
    userId?: string | null;
    zone?: unknown;
    key?: string;
    source?: PhaseLocationStub;
  } = {},
) =>
  execute(
    phaseSwitchConfirm(deps(opt.now ?? DECEMBER, opt.source)),
    { idempotency: idem },
    {
      context: { userId: opt.userId === undefined ? "anna" : opt.userId },
      input: { specimenIds: ids, timeZone: opt.zone ?? "UTC" },
      idempotencyKey: opt.key ?? `k${++counter}`,
    },
  );

const create = async (
  userId: string,
  name: string,
  speciesId: string,
  extra: { locationId?: string | null; status?: "plant" | "cutting" } = {},
) => {
  const r = await specimens.create(userId, {
    speciesId,
    name,
    marker: null,
    locationId: extra.locationId ?? null,
    caughtAt: "2026-09-01",
    status: extra.status ?? "plant",
  });
  if (typeof r === "string") throw new Error(r);
  return r;
};
const place = async (userId: string, id: string) => (await specimens.find(userId, id))?.locationId;

beforeEach(() => {
  specimens = new InMemorySpecimens({
    anna: [LIVING, COLD, SHADE],
    ben: [BEN_SPOT],
  });
  idem = new InMemoryIdempotencyStore();
});

describe("US-PHA-03 confirm the move with a tap", () => {
  it("US-PHA-03: 'moved now' sets the location to the target of today's phase and returns the new state", async () => {
    const z = await create("anna", "Bogenhanf", WINTER, { locationId: LIVING });
    const r = await confirm([z.id]);
    expect(r.ok && r.value).toEqual({
      specimens: [{ specimenId: z.id, locationId: COLD, changed: true }],
    });
    expect(await place("anna", z.id)).toBe(COLD);
  });

  it("US-PHA-03: the phase decides the target, in July the growth location applies", async () => {
    const z = await create("anna", "Bogenhanf", WINTER, { locationId: COLD });
    const r = await confirm([z.id], { now: JULY });
    expect(r.ok && r.value.specimens[0]).toMatchObject({ locationId: LIVING, changed: true });
  });

  it("US-PHA-03: 'today' is the local calendar date, not the UTC date (NFR-08)", async () => {
    const z = await create("anna", "Bogenhanf", WINTER, { locationId: LIVING });
    // 2026-10-31 23:30 UTC is already 1 November in Berlin: dormancy there, growth in UTC.
    const now = "2026-10-31T23:30:00Z";
    const berlin = await confirm([z.id], { now, zone: "Europe/Berlin" });
    expect(berlin.ok && berlin.value.specimens[0]?.locationId).toBe(COLD);
    const utc = await confirm([z.id], { now, zone: "UTC" });
    expect(utc.ok && utc.value.specimens[0]).toMatchObject({ locationId: LIVING, changed: true });
  });

  it("US-PHA-03: the location is never taken from the input, extra fields are dropped", async () => {
    const z = await create("anna", "Bogenhanf", WINTER, { locationId: LIVING });
    const r = await execute(
      phaseSwitchConfirm(deps(DECEMBER)),
      { idempotency: idem },
      {
        context: { userId: "anna" },
        input: { specimenIds: [z.id], timeZone: "UTC", locationId: SHADE },
        idempotencyKey: "free",
      },
    );
    expect(r.ok && r.value.specimens[0]?.locationId).toBe(COLD);
  });

  it("US-PHA-03: several specimens are confirmed in one step, each to the target of its own species", async () => {
    const a = await create("anna", "Bogenhanf", WINTER, { locationId: LIVING });
    const b = await create("anna", "Aloe", SUMMER, { locationId: LIVING });
    const c = await create("anna", "Zweiter Bogenhanf", WINTER, { locationId: null });
    const r = await confirm([a.id, b.id, c.id]);
    expect(r.ok && r.value.specimens).toEqual([
      { specimenId: a.id, locationId: COLD, changed: true },
      { specimenId: b.id, locationId: LIVING, changed: false },
      { specimenId: c.id, locationId: COLD, changed: true },
    ]);
    expect(await place("anna", c.id)).toBe(COLD);
  });

  it("US-PHA-03: confirming again with a new key changes nothing and reports changed=false (idempotent, US-QS-03)", async () => {
    const z = await create("anna", "Bogenhanf", WINTER, { locationId: LIVING });
    await confirm([z.id]);
    const again = await confirm([z.id]);
    expect(again.ok && again.value.specimens).toEqual([
      { specimenId: z.id, locationId: COLD, changed: false },
    ]);
    expect(await place("anna", z.id)).toBe(COLD);
  });

  it("US-PHA-03: a double tap with the same key writes once and answers the same", async () => {
    const z = await create("anna", "Bogenhanf", WINTER, { locationId: LIVING });
    const first = await confirm([z.id], { key: "tap" });
    const writes = specimens.writes;
    const second = await confirm([z.id], { key: "tap" });
    expect(second).toEqual(first);
    expect(specimens.writes).toBe(writes);
  });

  it("US-PHA-03: one specimen that cannot be switched stops the whole step, nothing is written", async () => {
    const plant = await create("anna", "Bogenhanf", WINTER, { locationId: LIVING });
    const cutting = await create("anna", "Steckling", WINTER, { status: "cutting" });
    const before = specimens.writes;
    const r = await confirm([plant.id, cutting.id]);
    expect(r).toMatchObject({
      ok: false,
      error: { code: "care.no_phase", data: { specimenId: cutting.id } },
    });
    expect(specimens.writes).toBe(before);
    expect(await place("anna", plant.id)).toBe(LIVING);
  });

  it("US-PHA-03: a species without dormancy period has no phase (care.no_phase)", async () => {
    const z = await create("anna", "Efeutute", WITHOUT);
    const r = await confirm([z.id]);
    expect(!r.ok && r.error.code).toBe("care.no_phase");
  });

  it("US-PHA-03: an unknown target location is refused, never invented (P-08)", async () => {
    const z = await create("anna", "Bogenhanf", WINTER, { locationId: LIVING });
    const r = await confirm([z.id], { source: new PhaseLocationStub({}) });
    expect(r).toMatchObject({
      ok: false,
      error: { code: "care.target_unknown", data: { specimenId: z.id } },
    });
    expect(await place("anna", z.id)).toBe(LIVING);
  });

  it("US-PHA-03: an archived specimen is not switched and reports specimen.archived (US-BES-07)", async () => {
    const z = await create("anna", "Alt", WINTER, { locationId: LIVING });
    await specimens.archive("anna", z.id, "eingegangen", "2026-10-01");
    const r = await confirm([z.id]);
    expect(r).toMatchObject({ ok: false, error: { code: "specimen.archived" } });
    expect(await place("anna", z.id)).toBe(LIVING);
  });

  it("US-PHA-03: a foreign or unknown specimen looks the same and stays untouched (P-04)", async () => {
    const foreign = await create("ben", "Bens Pflanze", WINTER, { locationId: null });
    for (const id of [foreign.id, UNKNOWN_ID]) {
      const r = await confirm([id]);
      expect(!r.ok && r.error.code).toBe("specimen.not_found");
    }
    expect(await place("ben", foreign.id)).toBeNull();
  });

  it("US-PHA-03: a target of another account is refused by the store and nothing is written (P-04)", async () => {
    const z = await create("anna", "Bogenhanf", WINTER, { locationId: LIVING });
    const wrong = new PhaseLocationStub({ anna: { [WINTER]: { dormancy: BEN_SPOT } } });
    const r = await confirm([z.id], { source: wrong });
    expect(!r.ok && r.error.code).toBe("location.not_found");
    expect(await place("anna", z.id)).toBe(LIVING);
  });

  it("US-PHA-03: invalid input (no list, empty list, no ID, bad time zone) writes nothing", async () => {
    const z = await create("anna", "Bogenhanf", WINTER, { locationId: LIVING });
    const before = specimens.writes;
    for (const ids of [undefined, [], ["Bogenhanf"], [z.id, 5], "x"]) {
      const r = await confirm(ids);
      expect(r).toMatchObject({ ok: false, error: { code: "input.invalid" } });
    }
    const zone = await confirm([z.id], { zone: "Nirgendwo" });
    expect(zone).toMatchObject({ ok: false, error: { code: "input.invalid" } });
    expect(specimens.writes).toBe(before);
  });

  it("US-PHA-03: the same ID twice counts once", async () => {
    const z = await create("anna", "Bogenhanf", WINTER, { locationId: LIVING });
    const r = await confirm([z.id, z.id.toUpperCase()]);
    expect(r.ok && r.value.specimens).toHaveLength(1);
  });

  it("US-PHA-03: without sign-in nothing happens", async () => {
    const z = await create("anna", "Bogenhanf", WINTER, { locationId: LIVING });
    const r = await confirm([z.id], { userId: null });
    expect(!r.ok && r.error.code).toBe("access.not_signed_in");
  });

  it("US-PHA-03: the list and the BES-08 hints agree with the switch afterwards", async () => {
    const light = new InMemoryLight();
    const location = await light.locationAdapter().create("anna", {
      name: "Kühler Flur",
      lightZoneId: null,
      kind: "indoor",
    });
    if (typeof location === "string") throw new Error(location);
    specimens = new InMemorySpecimens({ anna: [location.id] });
    const z = await create("anna", "Bogenhanf", WINTER);
    const source = new PhaseLocationStub({ anna: { [WINTER]: { dormancy: location.id } } });
    const hintsOf = async () =>
      (await specimenHints({ specimens, species, locations: light.locationAdapter() }, "anna")).map(
        (h) => h.kind,
      );
    expect(await hintsOf()).toEqual(["location_missing"]);

    const r = await confirm([z.id], { source });
    expect(r.ok && r.value.specimens[0]).toMatchObject({ locationId: location.id, changed: true });

    const list = await carePhasesList(deps(DECEMBER, source), "anna", "UTC");
    expect(list.ok && list.value[0]).toMatchObject({
      locationId: location.id,
      targetLocationId: location.id,
    });
    expect(await hintsOf()).toEqual(["location_without_zone"]);
  });
});
