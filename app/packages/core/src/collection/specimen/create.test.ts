import { beforeEach, describe, expect, it } from "vitest";
import { execute } from "../../kernel";
import { InMemoryIdempotencyStore } from "../../kernel/test-helpers";
import {
  specimenCorrectCatchDate,
  specimenCreate,
  specimenLoad,
  specimenList,
  NO_TARGET_LOCATION,
  type CatchDateStore,
} from "../index";
import {
  SpeciesStub,
  InMemorySpecimens,
  TargetLocationStub,
  testSpecies,
} from "../shared/test-helpers";

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

describe("US-BES-02 back-dated catch date (FR-BES-04, NFR-08)", () => {
  it("a catch date in the past is stored as given", async () => {
    const r = await create({ catchDate: "2022-02-03" });
    expect(r.ok && r.value.caughtAt).toBe("2022-02-03");
    expect(specimens.rows[0]?.caughtAt).toBe("2022-02-03");
  });

  it("without or with an empty catch date it stays today's local date", async () => {
    for (const [i, catchDate] of [undefined, null].entries()) {
      const r = await create({ catchDate, timeZone: "Europe/Berlin", marker: `Nr${i}` });
      expect(r.ok && r.value.caughtAt).toBe("2026-10-03");
    }
  });

  it("today's local date is allowed: in Berlin that is already the 3rd, in New York still the 2nd", async () => {
    const berlin = await create({ catchDate: "2026-10-03", timeZone: "Europe/Berlin" });
    expect(berlin.ok && berlin.value.caughtAt).toBe("2026-10-03");
    const newYork = await create({
      catchDate: "2026-10-02",
      timeZone: "America/New_York",
      marker: "Rot",
    });
    expect(newYork.ok && newYork.value.caughtAt).toBe("2026-10-02");
  });

  it("a date after the keeper's local today is refused, measured in the keeper's zone, not in UTC", async () => {
    // 2026-10-03 is already today in Berlin but still tomorrow in New York (UTC date: the 2nd).
    const r = await create({ catchDate: "2026-10-03", timeZone: "America/New_York" });
    expect(!r.ok && r.error.code).toBe("specimen.caught_in_future");
    expect(!r.ok && r.error.details).toEqual([
      { field: "catchDate", code: "specimen.caught_in_future" },
    ]);
    const far = await create({ catchDate: "2999-01-01" });
    expect(!far.ok && far.error.code).toBe("specimen.caught_in_future");
    expect(specimens.writes).toBe(0);
  });

  it.each([
    // [zone, local today, a date that is tomorrow there]
    ["Pacific/Kiritimati", "2026-10-03", "2026-10-04"], // +14: the local date is ahead of UTC (the 2nd)
    ["Pacific/Pago_Pago", "2026-10-02", "2026-10-03"], // -11: the local date is behind the Berlin date
  ])(
    "%s: local today is allowed, local tomorrow is refused (extreme zones)",
    async (timeZone, today, tomorrow) => {
      const ok = await create({ catchDate: today, timeZone });
      expect(ok.ok && ok.value.caughtAt).toBe(today);
      const refused = await create({ catchDate: tomorrow, timeZone, marker: "Rot" });
      expect(!refused.ok && refused.error.code).toBe("specimen.caught_in_future");
      expect(specimens.rows).toHaveLength(1);
    },
  );

  it("a date that is tomorrow in UTC but today in Kiritimati is accepted there, refused in UTC", async () => {
    const kiritimati = await create({ catchDate: "2026-10-03", timeZone: "Pacific/Kiritimati" });
    expect(kiritimati.ok).toBe(true);
    const utc = await create({ catchDate: "2026-10-03", timeZone: "UTC", marker: "Rot" });
    expect(!utc.ok && utc.error.code).toBe("specimen.caught_in_future");
  });

  it.each([
    ["not a date", "gestern"],
    ["wrong format", "03.02.2022"],
    ["month 13", "2022-13-01"],
    ["31st of February", "2022-02-31"],
    ["29th of February in a non-leap year", "2023-02-29"],
    ["with a time of day", "2022-02-03T10:00:00Z"],
    ["a number", 20220203],
    ["year before 1900", "1800-01-01"],
  ])(
    "%s is input.invalid on the field catchDate, nothing written (P-03)",
    async (_c, catchDate) => {
      const r = await create({ catchDate });
      expect(!r.ok && r.error.code).toBe("input.invalid");
      expect(!r.ok && r.error.details).toEqual([{ field: "catchDate", code: "input.invalid" }]);
      expect(specimens.writes).toBe(0);
    },
  );

  it("a leap day is a valid calendar date", async () => {
    const r = await create({ catchDate: "2024-02-29" });
    expect(r.ok && r.value.caughtAt).toBe("2024-02-29");
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
    // US-BES-03: a further specimen needs a marker; the error still names the existing ones.
    expect(!r.ok && r.error.code).toBe("specimen.marker_required");
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
    expect(!r.ok && r.error.code).toBe("specimen.marker_taken");
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

describe("US-BES-04 create a cutting", () => {
  it("US-BES-04: a cutting gets the location of the growth phase, not the target location of the dormancy", async () => {
    const target = new TargetLocationStub(FOREIGN_LOCATION, LOCATION);
    const r = await create({ status: "cutting" }, { target });
    expect(r.ok && r.value).toMatchObject({ status: "cutting", locationId: LOCATION });
    expect(target.growthCalls).toEqual([{ userId: "anna", speciesId: SPECIES }]);
    expect(target.calls).toEqual([]);
  });

  it("US-BES-04: a chosen location comes before the growth location", async () => {
    const r = await create(
      { status: "cutting", locationId: LOCATION },
      { target: new TargetLocationStub(null, "ignored") },
    );
    expect(r.ok && r.value.locationId).toBe(LOCATION);
  });

  it("US-BES-04: without a known growth location the location of the cutting stays unknown (P-08)", async () => {
    const r = await create({ status: "cutting" });
    expect(r.ok && r.value).toMatchObject({ status: "cutting", locationId: null });
  });

  it("US-BES-04: without a value or with 'plant' it stays a plant and the target location applies", async () => {
    for (const input of [{}, { status: "plant" }]) {
      const target = new TargetLocationStub(LOCATION, "other");
      const r = await create({ ...input, marker: `k${++counter}` }, { target });
      expect(r.ok && r.value).toMatchObject({ status: "plant", locationId: LOCATION });
      expect(target.growthCalls).toEqual([]);
    }
  });

  it("US-BES-04: 'archived' and unknown statuses are rejected at creation, nothing is written", async () => {
    for (const status of ["archived", "dead", 3]) {
      const r = await create({ status });
      expect(r.ok).toBe(false);
      expect(!r.ok && r.error.details).toEqual([{ field: "status", code: "input.invalid" }]);
    }
    expect(specimens.writes).toBe(0);
  });
});

/** The in-memory specimens plus the catch-date port (US-BES-11); the real adapter is one SQL statement in `db`. */
class InMemoryCatchDates extends InMemorySpecimens implements CatchDateStore {
  async setCaughtAt(userId: string, id: string, date: string) {
    const i = this.rows.findIndex((z) => z.userId === userId && z.id === id);
    const row = this.rows[i];
    if (!row) return "not_found" as const;
    if (row.archivedAt !== null && date > row.archivedAt) return "after_archived" as const;
    this.writes += 1;
    this.rows[i] = { ...row, caughtAt: date };
    const { userId: owner, ...without } = this.rows[i];
    void owner;
    return without;
  }
}

describe("US-BES-11 correct the catch date of a specimen", () => {
  let store: InMemoryCatchDates;
  const correct = (
    input: Record<string, unknown>,
    opt: { context?: { userId: string | null }; key?: string } = {},
  ) =>
    execute(
      specimenCorrectCatchDate({ specimens: store, clock: () => NOW }),
      { idempotency: idem },
      {
        context: opt.context ?? anna,
        input: { timeZone: "Europe/Berlin", ...input },
        idempotencyKey: opt.key ?? `k${++counter}`,
      },
    );
  const own = async (userId = "anna", extra: Record<string, unknown> = {}) => {
    const r = await store.create(userId, {
      speciesId: SPECIES,
      name: `Bogenhanf ${++counter}`,
      marker: `m${counter}`,
      locationId: null,
      caughtAt: "2026-09-01",
    });
    if (typeof r === "string") throw new Error(r);
    const i = store.rows.findIndex((z) => z.id === r.id);
    const row = store.rows[i];
    if (row) store.rows[i] = { ...row, ...extra };
    store.writes = 0;
    return r.id;
  };

  beforeEach(() => {
    store = new InMemoryCatchDates();
  });

  it("US-BES-11 a past date is stored as given; nothing else of the specimen changes", async () => {
    const id = await own();
    const before = store.rows.find((z) => z.id === id);
    const r = await correct({ specimenId: id, catchDate: "2019-05-17" });
    expect(r.ok && r.value).toMatchObject({ id, caughtAt: "2019-05-17" });
    expect(store.rows.find((z) => z.id === id)).toEqual({ ...before, caughtAt: "2019-05-17" });
  });

  it("US-BES-11 today in the keeper's time zone is allowed, tomorrow is specimen.caught_in_future on the field", async () => {
    const id = await own();
    // 23:30 UTC on 2 October: already 3 October in Berlin (NFR-08).
    const today = await correct({ specimenId: id, catchDate: "2026-10-03" });
    expect(today.ok && today.value.caughtAt).toBe("2026-10-03");
    store.writes = 0;
    const tomorrow = await correct({ specimenId: id, catchDate: "2026-10-04" });
    expect(!tomorrow.ok && tomorrow.error.code).toBe("specimen.caught_in_future");
    expect(!tomorrow.ok && tomorrow.error.details).toEqual([
      { field: "catchDate", code: "specimen.caught_in_future" },
    ]);
    expect(store.writes).toBe(0);
  });

  it("US-BES-11 'future' is measured against the local date, not the UTC date", async () => {
    const id = await own();
    const ny = await correct({
      specimenId: id,
      catchDate: "2026-10-03",
      timeZone: "America/New_York",
    });
    expect(!ny.ok && ny.error.code).toBe("specimen.caught_in_future");
    const kiritimati = await correct({
      specimenId: id,
      catchDate: "2026-10-03",
      timeZone: "Pacific/Kiritimati",
    });
    expect(kiritimati.ok).toBe(true);
  });

  it.each([
    ["missing", undefined],
    ["empty", null],
    ["31st of February", "2022-02-31"],
    ["with a time of day", "2022-02-03T10:00:00Z"],
    ["year before 1900", "1899-12-31"],
  ])(
    "US-BES-11 %s is input.invalid on the field catchDate, nothing written (P-03)",
    async (_c, catchDate) => {
      const id = await own();
      const r = await correct({ specimenId: id, catchDate });
      expect(!r.ok && r.error.code).toBe("input.invalid");
      expect(!r.ok && r.error.details).toEqual([{ field: "catchDate", code: "input.invalid" }]);
      expect(store.writes).toBe(0);
    },
  );

  it("US-BES-11 1900-01-01 is the earliest allowed date", async () => {
    const r = await correct({ specimenId: await own(), catchDate: "1900-01-01" });
    expect(r.ok && r.value.caughtAt).toBe("1900-01-01");
  });

  it("US-BES-11 an invalid time zone is input.invalid, nothing written", async () => {
    const r = await correct({
      specimenId: await own(),
      catchDate: "2020-01-01",
      timeZone: "+02:00",
    });
    expect(!r.ok && r.error.details).toEqual([{ field: "timeZone", code: "input.invalid" }]);
    expect(store.writes).toBe(0);
  });

  it("US-BES-11 an archived specimen can be corrected up to its archiving date; archiving date and reason stay", async () => {
    const archived = { status: "archived", archivedAt: "2026-01-10", archivedReason: "abgegeben" };
    const id = await own("anna", archived);
    const ok = await correct({ specimenId: id, catchDate: "2026-01-10" });
    expect(ok.ok && ok.value).toMatchObject({ caughtAt: "2026-01-10", ...archived });
    store.writes = 0;
    const after = await correct({ specimenId: id, catchDate: "2026-01-11" });
    expect(!after.ok && after.error.code).toBe("specimen.caught_after_archived");
    expect(!after.ok && after.error.details).toEqual([
      { field: "catchDate", code: "specimen.caught_after_archived" },
    ]);
    expect(store.rows.find((z) => z.id === id)?.caughtAt).toBe("2026-01-10");
  });

  it("US-BES-11 a specimen of another account looks like an unknown one: specimen.not_found, nothing changed (P-04)", async () => {
    const bens = await own("ben");
    const r = await correct({ specimenId: bens, catchDate: "2020-01-01" });
    expect(!r.ok && r.error.code).toBe("specimen.not_found");
    const unknown = await correct({
      specimenId: "99999999-9999-4999-8999-999999999999",
      catchDate: "2020-01-01",
    });
    expect(!unknown.ok && unknown.error).toEqual(!r.ok && r.error);
    expect(store.rows.find((z) => z.id === bens)?.caughtAt).toBe("2026-09-01");
  });

  it("US-BES-11 without sign-in: access.not_signed_in, nothing written", async () => {
    const id = await own();
    const r = await correct(
      { specimenId: id, catchDate: "2020-01-01" },
      { context: { userId: null } },
    );
    expect(!r.ok && r.error.code).toBe("access.not_signed_in");
    expect(store.writes).toBe(0);
  });

  it("US-BES-11 the same Idempotency-Key does not write twice", async () => {
    const id = await own();
    const first = await correct({ specimenId: id, catchDate: "2020-01-01" }, { key: "same" });
    const again = await correct({ specimenId: id, catchDate: "2020-01-01" }, { key: "same" });
    expect(again).toEqual(first);
    expect(store.writes).toBe(1);
  });
});
