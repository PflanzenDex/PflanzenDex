import { beforeEach, describe, expect, it } from "vitest";
import { execute } from "../kernel";
import { InMemoryIdempotencyStore } from "../kernel/test-helpers";
import { specimenCreate, specimenLoad, specimenList, NO_TARGET_LOCATION } from "./index";
import { SpeciesStub, InMemorySpecimens, TargetLocationStub, testSpecies } from "./test-helpers";

const SPECIES = "11111111-1111-4111-8111-111111111111";
const OTHER_SPECIES = "22222222-2222-4222-8222-222222222222";
const PRIVATE = "33333333-3333-4333-8333-333333333333";
const LOCATION = "44444444-4444-4444-8444-444444444444";
const FOREIGN_LOCATION = "55555555-5555-4555-8555-555555555555";
const anna = { userId: "anna" };
const ben = { userId: "ben" };
// 2026-10-02 23:30 UTC: already October 3rd in Berlin, still the 2nd in New York.
const NOW = new Date("2026-10-02T23:30:00Z");

let specimens: InMemorySpecimens;
let idem: InMemoryIdempotencyStore;
let counter = 0;

const species = new SpeciesStub([
  { species: testSpecies(SPECIES) },
  { species: testSpecies(OTHER_SPECIES, { germanName: null, latinName: "Aloe vera" }) },
  { species: testSpecies(PRIVATE, { germanName: "Geheim" }), only: "ben" },
]);

const create = (
  input: Record<string, unknown>,
  opt: { context?: { userId: string | null }; target?: TargetLocationStub; key?: string } = {},
) =>
  execute(
    specimenCreate({
      specimens,
      species,
      targetLocation: opt.target ?? NO_TARGET_LOCATION,
      clock: () => NOW,
    }),
    { idempotency: idem },
    {
      context: opt.context ?? anna,
      input: { speciesId: SPECIES, timeZone: "Europe/Berlin", ...input },
      idempotencyKey: opt.key ?? `k${++counter}`,
    },
  );

beforeEach(() => {
  specimens = new InMemorySpecimens({ anna: [LOCATION], ben: [FOREIGN_LOCATION] });
  idem = new InMemoryIdempotencyStore();
});

describe("US-BES-02 create specimen: required fields and prefill", () => {
  it("only the species is required; with it a specimen with all prefills is created", async () => {
    const r = await create({});
    expect(r.ok && r.value).toMatchObject({
      speciesId: SPECIES,
      name: "Bogenhanf",
      marker: null,
      status: "plant",
      locationId: null,
    });
    expect(specimens.rows).toHaveLength(1);
  });

  it.each([
    ["without species", { speciesId: undefined }],
    ["with invalid species id", { speciesId: "kaktus" }],
    ["without time zone", { timeZone: undefined }],
    ["with unknown time zone", { timeZone: "Mars/Olympus" }],
    ["with empty marker", { marker: "   " }],
    ["with invalid location", { locationId: "regal" }],
  ])("%s: rejected, nothing written (P-03)", async (_case, input) => {
    const r = await create(input);
    expect(!r.ok && r.error.code).toBe("input.invalid");
    expect(specimens.writes).toBe(0);
  });

  it('a species that does not exist or that the account may not see is "not found" (P-04)', async () => {
    for (const speciesId of ["99999999-9999-4999-8999-999999999999", PRIVATE]) {
      const r = await create({ speciesId });
      expect(!r.ok && r.error.code).toBe("species.not_found");
    }
    expect(specimens.writes).toBe(0);
    expect((await create({ speciesId: PRIVATE }, { context: ben })).ok).toBe(true);
  });

  it("empty measurements and empty treatment list are derived, not stored", async () => {
    const r = await create({});
    expect(r.ok && r.value).toMatchObject({ measurements: [], treatments: [] });
    const loaded = await specimenLoad(specimens, "anna", specimens.rows[0]?.id ?? "");
    expect(loaded).toMatchObject({ measurements: [], treatments: [] });
    expect(Object.keys(specimens.rows[0] ?? {})).not.toContain("measurements");
  });
});

describe("US-BES-02 caught_at is today's local date (FR-BES-04, NFR-08)", () => {
  it("after midnight in Berlin but still before midnight in UTC, the Berlin date applies", async () => {
    const r = await create({ timeZone: "Europe/Berlin" });
    expect(r.ok && r.value.caughtAt).toBe("2026-10-03");
  });

  it("in New York the same moment is still the previous day", async () => {
    const r = await create({ timeZone: "America/New_York" });
    expect(r.ok && r.value.caughtAt).toBe("2026-10-02");
  });
});

describe("US-BES-02 location by today's phase (target location, FR-PHA-05)", () => {
  it("the location comes from the target-location port; it learns species and local date", async () => {
    const target = new TargetLocationStub(LOCATION);
    const r = await create({}, { target });
    expect(r.ok && r.value.locationId).toBe(LOCATION);
    expect(target.calls).toEqual([{ userId: "anna", speciesId: SPECIES, today: "2026-10-03" }]);
  });

  it('if nobody knows a target location, the location stays "unknown" (null), it is not invented (P-08)', async () => {
    const r = await create({}, { target: new TargetLocationStub(null) });
    expect(r.ok && r.value.locationId).toBeNull();
  });

  it("a chosen own location takes precedence over the target location", async () => {
    const target = new TargetLocationStub(null);
    const r = await create({ locationId: LOCATION }, { target });
    expect(r.ok && r.value.locationId).toBe(LOCATION);
    expect(target.calls).toEqual([]);
  });

  it("a foreign or unknown location is rejected, nothing written", async () => {
    const r = await create({ locationId: FOREIGN_LOCATION });
    expect(!r.ok && r.error.code).toBe("location.not_found");
    expect(specimens.rows).toHaveLength(0);
  });

  it("a target location that does not (or no longer) exist in the account is rejected instead of silently dropped (P-10)", async () => {
    const r = await create({}, { target: new TargetLocationStub(FOREIGN_LOCATION) });
    expect(!r.ok && r.error.code).toBe("location.not_found");
    expect(specimens.rows).toHaveLength(0);
  });
});

describe("US-BES-02 the name is fixed before saving (DM-BES-03, FR-BES-03)", () => {
  it("if the name already exists, nothing changes and the error names the naming rule", async () => {
    await create({});
    const before = specimens.rows.map((z) => ({ ...z }));
    const r = await create({});
    expect(!r.ok && r.error.code).toBe("specimen.name_taken");
    expect(!r.ok && r.error.data).toMatchObject({
      name: "Bogenhanf",
      existing: [{ name: "Bogenhanf" }],
    });
    expect(specimens.rows).toEqual(before);
  });

  it('with a marker "Species – marker" is created, the first specimen keeps its name', async () => {
    await create({});
    const r = await create({ marker: "rot" });
    expect(r.ok && r.value).toMatchObject({ name: "Bogenhanf – rot", marker: "rot" });
    expect(specimens.rows.map((z) => z.name)).toEqual(["Bogenhanf", "Bogenhanf – rot"]);
  });

  it("the same marker is not allowed twice per species (case-insensitive), without change", async () => {
    await create({ marker: "rot" });
    const r = await create({ marker: "ROT" });
    expect(!r.ok && r.error.code).toBe("specimen.name_taken");
    expect(specimens.rows).toHaveLength(1);
  });

  it("the name comes from the Latin name if the species has no German one", async () => {
    const r = await create({ speciesId: OTHER_SPECIES });
    expect(r.ok && r.value.name).toBe("Aloe vera");
  });
});

describe("US-BES-02 account, idempotency and sign-in (P-03, P-04)", () => {
  it("each account has its own specimens; the same name at another account is allowed", async () => {
    await create({});
    const b = await create({}, { context: ben });
    expect(b.ok).toBe(true);
    expect(await specimenList(specimens, "anna")).toHaveLength(1);
    const id = specimens.rows[0]?.id ?? "";
    expect(await specimenLoad(specimens, "ben", id)).toBeNull();
    expect(await specimenLoad(specimens, "anna", id)).not.toBeNull();
  });

  it("the same Idempotency-Key does not create twice and returns the same result", async () => {
    const first = await create({}, { key: "same" });
    const noch = await create({}, { key: "same" });
    expect(noch).toEqual(first);
    expect(specimens.rows).toHaveLength(1);
  });

  it("without sign-in: access.not_signed_in, nothing written", async () => {
    const r = await create({}, { context: { userId: null } });
    expect(!r.ok && r.error.code).toBe("access.not_signed_in");
    expect(specimens.writes).toBe(0);
  });

  it('loading a specimen with an invalid id is "not found" (null)', async () => {
    expect(await specimenLoad(specimens, "anna", "kaktus")).toBeNull();
  });
});
