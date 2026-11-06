import { describe, expect, it } from "vitest";
import { SpeciesStub, InMemorySpecimens, testSpecies } from "../../collection/shared/test-helpers";
import {
  NO_PHASE_LOCATION,
  carePhase,
  carePhasesList,
  carePhasesOf,
  careProfileLocations,
} from "../index";
import { InMemoryCareProfiles } from "../../collection/care-profile/care-profile-test-helpers";
import { PhaseLocationStub } from "../shared/test-helpers";

const WINTER = "11111111-1111-4111-8111-111111111111"; // Dormancy 11-01 to 03-15, across the turn of the year
const SUMMER = "22222222-2222-4222-8222-222222222222"; // Dormancy 06-01 to 08-31, within the same year
const WITHOUT = "33333333-3333-4333-8333-333333333333"; // without dormancy period
const PRIVATE = "44444444-4444-4444-8444-444444444444";
const LOCATION = "55555555-5555-4555-8555-555555555555";

const species = new SpeciesStub([
  {
    species: testSpecies(WINTER, {
      germanName: "Bogenhanf",
      dormancyFrom: "11-01",
      dormancyUntil: "03-15",
    }),
  },
  {
    species: testSpecies(SUMMER, {
      germanName: "Aloe",
      dormancyFrom: "06-01",
      dormancyUntil: "08-31",
    }),
  },
  { species: testSpecies(WITHOUT, { germanName: "Efeutute" }) },
  {
    species: testSpecies(PRIVATE, {
      germanName: "Geheim",
      dormancyFrom: "11-01",
      dormancyUntil: "03-15",
    }),
    only: "ben",
  },
]);

async function collection(
  userId: string,
  rows: { speciesId: string; name: string; location?: string }[],
  status?: Record<string, "cutting" | "archived">,
) {
  const store = new InMemorySpecimens({ [userId]: [LOCATION] });
  for (const z of rows)
    await store.create(userId, {
      speciesId: z.speciesId,
      name: z.name,
      marker: null,
      locationId: z.location ?? null,
      caughtAt: "2026-01-01",
    });
  for (const row of store.rows)
    if (status?.[row.name]) Object.assign(row, { status: status[row.name] });
  return store;
}

const list = (
  specimens: InMemorySpecimens,
  userId: string,
  now: string,
  zone: unknown = "UTC",
  targets: PhaseLocationStub | typeof NO_PHASE_LOCATION = NO_PHASE_LOCATION,
) =>
  carePhasesList(
    {
      specimens,
      species,
      targets,
      profiles: new InMemoryCareProfiles(),
      clock: () => new Date(now),
    },
    userId,
    zone,
  );

describe("US-PHA-01 Phase of a specimen", () => {
  it("US-PHA-01 period within the same year: dormancy at the boundaries and in between, otherwise growth", () => {
    expect(carePhase("06-01", "08-31", "2026-06-01")).toBe("dormancy");
    expect(carePhase("06-01", "08-31", "2026-07-15")).toBe("dormancy");
    expect(carePhase("06-01", "08-31", "2026-08-31")).toBe("dormancy");
    expect(carePhase("06-01", "08-31", "2026-05-31")).toBe("growth");
    expect(carePhase("06-01", "08-31", "2026-09-01")).toBe("growth");
  });

  it("US-PHA-01 period across the turn of the year (11-01 to 03-15)", () => {
    for (const tag of ["2026-11-01", "2026-12-31", "2027-01-01", "2027-03-15"])
      expect(carePhase("11-01", "03-15", tag)).toBe("dormancy");
    for (const tag of ["2026-10-31", "2027-03-16", "2026-07-01"])
      expect(carePhase("11-01", "03-15", tag)).toBe("growth");
  });

  it("US-PHA-01 lists only active specimens whose species has a dormancy period", async () => {
    const e = await collection(
      "anna",
      [
        { speciesId: WINTER, name: "Bogenhanf" },
        { speciesId: WITHOUT, name: "Efeutute" },
        { speciesId: WINTER, name: "Steckling Bogenhanf" },
        { speciesId: SUMMER, name: "Aloe alt" },
      ],
      { "Steckling Bogenhanf": "cutting", "Aloe alt": "archived" },
    );
    const r = await list(e, "anna", "2026-12-01T12:00:00Z");
    expect(r.ok && r.value.map((z) => z.name)).toEqual(["Bogenhanf"]);
    expect(r.ok && r.value[0]).toMatchObject({ phase: "dormancy", speciesId: WINTER });
  });

  it("US-PHA-01 the phase follows today's date in the user's time zone, not the UTC date", async () => {
    const e = await collection("anna", [{ speciesId: WINTER, name: "Bogenhanf" }]);
    // 2026-10-31 23:30 UTC: still 31.10. in UTC (growth), already 1.11. in Berlin (dormancy).
    const now = "2026-10-31T23:30:00Z";
    const berlin = await list(e, "anna", now, "Europe/Berlin");
    const utc = await list(e, "anna", now, "UTC");
    expect(berlin.ok && berlin.value[0]?.phase).toBe("dormancy");
    expect(utc.ok && utc.value[0]?.phase).toBe("growth");
  });

  it("US-PHA-04 every row carries the next phase change from today in the user's time zone", async () => {
    const e = await collection("anna", [{ speciesId: WINTER, name: "Bogenhanf" }]);
    const now = "2026-10-31T23:30:00Z";
    const berlin = await list(e, "anna", now, "Europe/Berlin");
    const utc = await list(e, "anna", now, "UTC");
    const change = { date: "2026-11-01", phase: "dormancy" };
    expect(berlin.ok && berlin.value[0]?.nextChange).toEqual({ ...change, days: 0 });
    expect(utc.ok && utc.value[0]?.nextChange).toEqual({ ...change, days: 1 });
  });

  it("US-PHA-01 the target location stays unknown as long as there is no care profile (P-08)", async () => {
    const e = await collection("anna", [
      { speciesId: WINTER, name: "Bogenhanf", location: LOCATION },
    ]);
    const r = await list(e, "anna", "2026-12-01T12:00:00Z");
    expect(r.ok && r.value[0]).toMatchObject({ locationId: LOCATION, targetLocationId: null });
  });

  it("US-PHA-03 the target location is the one of the keeper for today's phase (list and switch agree)", async () => {
    const WINTER_SPOT = "66666666-6666-4666-8666-666666666666";
    const SUMMER_SPOT = "77777777-7777-4777-8777-777777777777";
    const targets = new PhaseLocationStub({
      anna: { [WINTER]: { dormancy: WINTER_SPOT, growth: SUMMER_SPOT } },
    });
    const e = await collection("anna", [
      { speciesId: WINTER, name: "Bogenhanf", location: LOCATION },
    ]);
    const dormant = await list(e, "anna", "2026-12-01T12:00:00Z", "UTC", targets);
    expect(dormant.ok && dormant.value[0]).toMatchObject({ targetLocationId: WINTER_SPOT });
    const growing = await list(e, "anna", "2026-07-01T12:00:00Z", "UTC", targets);
    expect(growing.ok && growing.value[0]).toMatchObject({ targetLocationId: SUMMER_SPOT });
    // Another account has no care profile entry: unknown, never the foreign one (P-04, P-08).
    const ben = await collection("ben", [{ speciesId: WINTER, name: "Ben" }]);
    const other = await list(ben, "ben", "2026-12-01T12:00:00Z", "UTC", targets);
    expect(other.ok && other.value[0]).toMatchObject({ targetLocationId: null });
  });

  it("US-PHA-01 foreign specimens and foreign private species stay invisible (P-04)", async () => {
    const e = await collection("ben", [{ speciesId: PRIVATE, name: "Geheim" }]);
    const forAnna = await list(e, "anna", "2026-12-01T12:00:00Z");
    expect(forAnna.ok && forAnna.value).toEqual([]);
    const forBen = await list(e, "ben", "2026-12-01T12:00:00Z");
    expect(forBen.ok && forBen.value).toHaveLength(1);
    // Anna's species view does not know the private species: her specimen of the same ID would not be listed.
    const anna = await collection("anna", [{ speciesId: PRIVATE, name: "Geheim" }]);
    const r = await list(anna, "anna", "2026-12-01T12:00:00Z");
    expect(r.ok && r.value).toEqual([]);
  });

  it("US-PHA-01 an invalid time zone writes and reads nothing and reports input.invalid", async () => {
    const e = await collection("anna", [{ speciesId: WINTER, name: "Bogenhanf" }]);
    for (const zone of [null, "", "+02:00", "Nirgendwo/Stadt"]) {
      const r = await list(e, "anna", "2026-12-01T12:00:00Z", zone);
      expect(r).toMatchObject({ ok: false, error: { code: "input.invalid" } });
    }
  });
});

describe("NFR-12 the phase list reads the care profiles once, however many specimens it lists", () => {
  const GROWTH_SPOT = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const DORMANT_SPOT = "99999999-9999-4999-8999-999999999999";

  it("NFR-12 every specimen gets its target from one reading of the profiles (no read per row)", async () => {
    const profiles = new InMemoryCareProfiles({
      anna: { locations: [GROWTH_SPOT, DORMANT_SPOT] },
    });
    await profiles.update("anna", WINTER, {
      growthLocationId: GROWTH_SPOT,
      dormancyLocationId: DORMANT_SPOT,
    });
    let reads = 0;
    const counted = {
      list: async (userId: string) => {
        reads += 1;
        return profiles.list(userId);
      },
    };
    const e = await collection("anna", [
      { speciesId: WINTER, name: "Bogenhanf 1", location: LOCATION },
      { speciesId: WINTER, name: "Bogenhanf 2", location: LOCATION },
      { speciesId: WINTER, name: "Bogenhanf 3", location: LOCATION },
      { speciesId: SUMMER, name: "Aloe", location: LOCATION },
    ]);
    const r = await carePhasesList(
      {
        specimens: e,
        species,
        targets: careProfileLocations(counted),
        profiles: counted,
        clock: () => new Date("2026-12-01T12:00:00Z"),
      },
      "anna",
      "UTC",
    );
    expect(reads).toBe(1);
    const byName = new Map(r.ok ? r.value.map((row) => [row.name, row] as const) : []);
    for (const name of ["Bogenhanf 1", "Bogenhanf 2", "Bogenhanf 3"])
      expect(byName.get(name)).toMatchObject({ phase: "dormancy", targetLocationId: DORMANT_SPOT });
    // No profile for Aloe: its target stays unknown (P-08).
    expect(byName.get("Aloe")).toMatchObject({ targetLocationId: null });
  });
});

describe("US-PHA-01 NFR-12 the phase of named specimens is the one of the phase list", () => {
  const NOW = "2026-10-31T23:30:00Z"; // 31.10. in UTC, already 1.11. in Berlin
  const deps = (specimens: InMemorySpecimens) => ({
    specimens,
    species,
    profiles: new InMemoryCareProfiles(),
    clock: () => new Date(NOW),
  });
  const idsOf = (store: InMemorySpecimens, userId: string) =>
    store.rows.filter((r) => r.userId === userId).map((r) => r.id);

  it("US-PHA-01 NFR-12 each named specimen has the phase of its row; cuttings and species without a period are missing", async () => {
    const e = await collection(
      "anna",
      [
        { speciesId: WINTER, name: "Bogenhanf" },
        { speciesId: SUMMER, name: "Aloe" },
        { speciesId: WITHOUT, name: "Efeutute" },
        { speciesId: WINTER, name: "Steckling Bogenhanf" },
      ],
      { "Steckling Bogenhanf": "cutting" },
    );
    const rows = await list(e, "anna", NOW, "UTC");
    const phases = await carePhasesOf(deps(e), "anna", idsOf(e, "anna"), "UTC");
    expect(rows.ok && rows.value.length).toBe(2);
    for (const row of rows.ok ? rows.value : []) expect(phases.get(row.specimenId)).toBe(row.phase);
    expect(phases.size).toBe(2);
    expect(phases.get(idsOf(e, "anna")[2] as string)).toBeUndefined();
    expect(phases.get(idsOf(e, "anna")[3] as string)).toBeUndefined();
  });

  it("US-PHA-01 NFR-12 the phase follows today's date in the user's time zone", async () => {
    const e = await collection("anna", [{ speciesId: WINTER, name: "Bogenhanf" }]);
    const ids = idsOf(e, "anna");
    expect((await carePhasesOf(deps(e), "anna", ids, "Europe/Berlin")).get(ids[0] as string)).toBe(
      "dormancy",
    );
    expect((await carePhasesOf(deps(e), "anna", ids, "UTC")).get(ids[0] as string)).toBe("growth");
  });

  it("US-PHA-01 NFR-12 P-04: another account's specimen is missing, and nothing is read for no ID", async () => {
    const ben = await collection("ben", [{ speciesId: WINTER, name: "Ben" }]);
    const benId = idsOf(ben, "ben");
    expect((await carePhasesOf(deps(ben), "anna", benId, "UTC")).size).toBe(0);
    expect((await carePhasesOf(deps(ben), "ben", benId, "UTC")).size).toBe(1);
    expect((await carePhasesOf(deps(ben), "ben", [], "UTC")).size).toBe(0);
  });

  it("US-PHA-01 US-SOZ-09 NFR-12 carePhasesOf reads the species of the named plants only", async () => {
    const e = await collection("anna", [
      { speciesId: WINTER, name: "Bogenhanf" },
      { speciesId: SUMMER, name: "Aloe" },
    ]);
    const [winter = ""] = idsOf(e, "anna");
    const asked: (readonly string[])[] = [];
    const recording = {
      find: (userId: string, id: string) => species.find(userId, id),
      findMany: (userId: string, ids: readonly string[]) => {
        asked.push([...ids]);
        return species.findMany(userId, ids);
      },
    };
    const phases = await carePhasesOf({ ...deps(e), species: recording }, "anna", [winter], "UTC");
    expect([...phases.keys()]).toEqual([winter]);
    expect(asked).toEqual([[WINTER]]);
  });
});
