import { describe, expect, it } from "vitest";
import { SpeciesStub, InMemorySpecimens, testSpecies } from "../collection/shared/test-helpers";
import { NO_PHASE_LOCATION, carePhase, carePhasesList } from "./index";
import { InMemoryCareProfiles } from "../collection/care-profile/care-profile-test-helpers";
import { PhaseLocationStub } from "./test-helpers";

const WINTER = "11111111-1111-4111-8111-111111111111"; // Dormancy 11-01 to 03-15, across the turn of the year
const SUMMER = "22222222-2222-4222-8222-222222222222"; // Dormancy 06-01 to 08-31, within the same year
const WITHOUT = "33333333-3333-4333-8333-333333333333"; // ohne Ruhephasen-Zeitraum
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

describe("US-PHA-01 Phase eines Exemplars", () => {
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
