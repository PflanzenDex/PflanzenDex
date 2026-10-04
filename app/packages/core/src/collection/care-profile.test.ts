import { beforeEach, describe, expect, it } from "vitest";
import { execute } from "../kernel";
import { InMemoryIdempotencyStore } from "../kernel/test-helpers";
import { careProfileUpdate } from "./index";
import { InMemoryCareProfiles } from "./care-profile-test-helpers";
import { SpeciesStub, testSpecies } from "./test-helpers";

const SPECIES = "11111111-1111-4111-8111-111111111111";
const PRIVATE = "22222222-2222-4222-8222-222222222222";
const LOC_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LOC_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LOC_BEN = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ZONE_A = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ZONE_BEN = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

const species = new SpeciesStub([
  { species: testSpecies(SPECIES, { dormancyFrom: "11-01", dormancyUntil: "03-15" }) },
  { species: testSpecies(PRIVATE), only: "ben" },
]);

let profiles: InMemoryCareProfiles;
let idem: InMemoryIdempotencyStore;
let counter = 0;

const update = (
  input: Record<string, unknown>,
  opt: { user?: string | null; key?: string; speciesId?: unknown } = {},
) =>
  execute(
    careProfileUpdate({ profiles, species }),
    { idempotency: idem },
    {
      context: { userId: opt.user === undefined ? "anna" : opt.user },
      input: { speciesId: opt.speciesId ?? SPECIES, ...input },
      idempotencyKey: opt.key ?? `k${++counter}`,
    },
  );

const codes = (r: Awaited<ReturnType<typeof update>>) => (r.ok ? [] : [r.error.code]);
const fields = (r: Awaited<ReturnType<typeof update>>) =>
  r.ok ? [] : (r.error.details ?? []).map((d) => d.field);

beforeEach(() => {
  profiles = new InMemoryCareProfiles({
    anna: { locations: [LOC_A, LOC_B], zones: [ZONE_A] },
    ben: { locations: [LOC_BEN], zones: [ZONE_BEN] },
  });
  idem = new InMemoryIdempotencyStore();
});

describe("US-BES-09 change my care profile", () => {
  it("US-BES-09 sets target locations per phase, the zone, dormancy, watering and own hints", async () => {
    const r = await update({
      growthLocationId: LOC_A,
      dormancyLocationId: LOC_B,
      lightZoneId: ZONE_A,
      dormancyFrom: "10-15",
      dormancyUntil: "02-28",
      wateringGrowthDays: 7,
      wateringDormancyDays: 28,
      ownHints: "  Im Winter fast trocken halten.  ",
    });
    expect(r.ok && r.value).toEqual({
      speciesId: SPECIES,
      growthLocationId: LOC_A,
      dormancyLocationId: LOC_B,
      lightZoneId: ZONE_A,
      dormancyFrom: "10-15",
      dormancyUntil: "02-28",
      wateringGrowthDays: 7,
      wateringDormancyDays: 28,
      ownHints: "Im Winter fast trocken halten.",
    });
  });

  it("US-BES-09 a change names only some fields: the others stay as they are", async () => {
    await update({ growthLocationId: LOC_A, wateringGrowthDays: 7 });
    const r = await update({ dormancyLocationId: LOC_B });
    expect(r.ok && r.value).toMatchObject({
      growthLocationId: LOC_A,
      dormancyLocationId: LOC_B,
      wateringGrowthDays: 7,
    });
  });

  it("US-BES-09 reset to catalog per field: null clears exactly that field", async () => {
    await update({ growthLocationId: LOC_A, dormancyFrom: "10-15", dormancyUntil: "02-28" });
    const r = await update({ growthLocationId: null });
    expect(r.ok && r.value).toMatchObject({
      growthLocationId: null,
      dormancyFrom: "10-15",
      dormancyUntil: "02-28",
    });
  });

  it("US-BES-09 an empty care profile is valid: everything reset leaves a profile without deviation", async () => {
    await update({ growthLocationId: LOC_A, lightZoneId: ZONE_A });
    const r = await update({ growthLocationId: null, lightZoneId: null });
    expect(r.ok && r.value).toMatchObject({ growthLocationId: null, lightZoneId: null });
  });

  it("US-BES-09 a request that changes nothing is invalid, it is not silently accepted (P-10)", async () => {
    const r = await update({});
    expect(codes(r)).toEqual(["input.invalid"]);
    expect(profiles.writes).toBe(0);
  });

  it("US-BES-09 only overridable fields can be changed: catalog fields are refused and nothing is written (FR-BES-09)", async () => {
    for (const field of ["latinName", "growthMeasure", "difficulty", "successCriteria"]) {
      const r = await update({ growthLocationId: LOC_A, [field]: "x" });
      expect(codes(r)).toEqual(["input.invalid"]);
      expect(fields(r)).toEqual([field]);
    }
    expect(profiles.writes).toBe(0);
  });

  it("US-BES-09 the target location is selected from my locations: a location of another account is refused (FR-PHA-03, P-04)", async () => {
    const r = await update({ growthLocationId: LOC_BEN });
    expect(codes(r)).toEqual(["location.not_found"]);
    expect(profiles.rows).toEqual([]);
  });

  it("US-BES-09 a free-typed location is no ID and is refused", async () => {
    const r = await update({ dormancyLocationId: "Wohnzimmer" });
    expect(codes(r)).toEqual(["input.invalid"]);
    expect(fields(r)).toEqual(["dormancyLocationId"]);
  });

  it("US-BES-09 the zone override must be one of my zones (P-04)", async () => {
    const r = await update({ lightZoneId: ZONE_BEN });
    expect(codes(r)).toEqual(["light_zone.not_found"]);
    expect(profiles.rows).toEqual([]);
  });

  it("US-BES-09 dormancy from/until may span the new year and only counts as a pair", async () => {
    expect((await update({ dormancyFrom: "11-01", dormancyUntil: "03-15" })).ok).toBe(true);
    const half = await update({ dormancyFrom: "11-01" });
    expect(codes(half)).toEqual(["input.invalid"]);
    expect(fields(half)).toEqual(["dormancyUntil"]);
    const mixed = await update({ dormancyFrom: "11-01", dormancyUntil: null });
    expect(codes(mixed)).toEqual(["input.invalid"]);
  });

  it("US-BES-09 dormancy resets as a pair", async () => {
    await update({ dormancyFrom: "11-01", dormancyUntil: "03-15" });
    const r = await update({ dormancyFrom: null, dormancyUntil: null });
    expect(r.ok && r.value).toMatchObject({ dormancyFrom: null, dormancyUntil: null });
  });

  it("US-BES-09 a date that does not exist is refused (13-01, 02-30, text)", async () => {
    for (const bad of ["13-01", "02-30", "1. Nov", "11-1", 1101])
      expect(codes(await update({ dormancyFrom: bad, dormancyUntil: "03-15" }))).toEqual([
        "input.invalid",
      ]);
  });

  it("US-BES-09 watering intervals are whole days from 1 to 365 (assumption)", async () => {
    for (const ok of [1, 365]) expect((await update({ wateringGrowthDays: ok })).ok).toBe(true);
    for (const bad of [0, 366, 2.5, -3, "7", Number.NaN])
      expect(fields(await update({ wateringDormancyDays: bad }))).toEqual(["wateringDormancyDays"]);
  });

  it("US-BES-09 own hints are text of 1 to 1000 characters; empty text is refused, null resets", async () => {
    expect(codes(await update({ ownHints: "   " }))).toEqual(["input.invalid"]);
    expect(codes(await update({ ownHints: "x".repeat(1001) }))).toEqual(["input.invalid"]);
    await update({ ownHints: "Bleibt trocken" });
    const r = await update({ ownHints: null });
    expect(r.ok && r.value).toMatchObject({ ownHints: null });
  });

  it("US-BES-09 an unknown species and a private species of another account are species.not_found (P-04)", async () => {
    const unknown = await update(
      { growthLocationId: LOC_A },
      { speciesId: "99999999-9999-4999-8999-999999999999" },
    );
    expect(codes(unknown)).toEqual(["species.not_found"]);
    const foreign = await update({ growthLocationId: LOC_A }, { speciesId: PRIVATE });
    expect(codes(foreign)).toEqual(["species.not_found"]);
    expect(profiles.rows).toEqual([]);
  });

  it("US-BES-09 the species is no ID: input.invalid, nothing written", async () => {
    const r = await update({ growthLocationId: LOC_A }, { speciesId: "Monstera" });
    expect(codes(r)).toEqual(["input.invalid"]);
    expect(profiles.writes).toBe(0);
  });

  it("US-BES-09 without sign-in nothing is written", async () => {
    const r = await update({ growthLocationId: LOC_A }, { user: null });
    expect(codes(r)).toEqual(["access.not_signed_in"]);
    expect(profiles.writes).toBe(0);
  });

  it("US-BES-09 the same Idempotency-Key writes once (US-QS-03)", async () => {
    const first = await update({ wateringGrowthDays: 7 }, { key: "same" });
    const second = await update({ wateringGrowthDays: 7 }, { key: "same" });
    expect(second).toEqual(first);
    expect(profiles.writes).toBe(1);
  });

  it("US-BES-09 the profile is private: another account's profile of the same species stays empty (P-05)", async () => {
    await update({ growthLocationId: LOC_A });
    const ben = await update({ dormancyLocationId: LOC_BEN }, { user: "ben" });
    expect(ben.ok && ben.value).toMatchObject({ growthLocationId: null });
    expect(await profiles.list("anna")).toEqual([
      expect.objectContaining({ growthLocationId: LOC_A, dormancyLocationId: null }),
    ]);
    expect(await profiles.list("ben")).toEqual([
      expect.objectContaining({ growthLocationId: null, dormancyLocationId: LOC_BEN }),
    ]);
  });

  it("US-BES-09 the species itself is never changed: the operation has no way to write the catalog", async () => {
    const before = JSON.stringify(await species.find("anna", SPECIES));
    await update({ growthLocationId: LOC_A, dormancyFrom: "01-01", dormancyUntil: "02-01" });
    expect(JSON.stringify(await species.find("anna", SPECIES))).toBe(before);
  });
});
