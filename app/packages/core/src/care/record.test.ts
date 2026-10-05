import { beforeEach, describe, expect, it } from "vitest";
import { execute } from "../kernel/operation";
import { InMemoryIdempotencyStore } from "../kernel/test-helpers";
import { measurementView, measurementRecord } from "./index";
import { SpecimenStub, InMemoryMeasurements, speciesStub } from "./test-helpers";

const E1 = "00000000-0000-4000-8000-000000000001";
const E2 = "00000000-0000-4000-8000-000000000002";
const anna = { userId: "anna" };
// 2026-10-02 23:30 UTC: already 3 October in Berlin, still 2 October in New York (NFR-08).
const NOW = new Date("2026-10-02T23:30:00Z");

let measurements: InMemoryMeasurements;
let idem: InMemoryIdempotencyStore;
let counter = 0;

const record = (
  input: unknown,
  context = anna,
  key = `k${++counter}`,
  archived: readonly string[] = [],
) =>
  execute(
    measurementRecord({
      measurements,
      specimens: new SpecimenStub({ anna: [E1], ben: [E2] }, archived),
      clock: () => NOW,
    }),
    { idempotency: idem },
    { context, input, idempotencyKey: key },
  );
const input = (extra: Record<string, unknown> = {}) => ({
  specimenId: E1,
  timeZone: "Europe/Berlin",
  value: 12.5,
  ...extra,
});

beforeEach(() => {
  measurements = new InMemoryMeasurements({ anna: [E1], ben: [E2] });
  idem = new InMemoryIdempotencyStore();
});

describe("US-WAC-01 Messung erfassen: Eingabe", () => {
  it("stores number, quality and note for the specimen", async () => {
    const r = await record(
      input({ value: 14, quality: "etiolated", note: "  nach dem Umtopfen " }),
    );
    expect(r).toMatchObject({
      ok: true,
      value: { specimenId: E1, value: 14, quality: "etiolated", note: "nach dem Umtopfen" },
    });
    expect(measurements.rows).toHaveLength(1);
  });

  it("without quality and note: healthy and no note", async () => {
    const r = await record(input());
    expect(r).toMatchObject({ ok: true, value: { quality: "healthy", note: null } });
  });

  it.each([
    ["Text", "zwölf"],
    ["Zahl als Text", "12.5"],
    ["empty", undefined],
    ["negativ", -0.5],
    ["unendlich", Infinity],
    ["nicht im Schritt 0,5", 12.3],
    ["über der Grenze", 10_001],
  ])("rejects an invalid number (%s) and writes nothing", async (_, value) => {
    const r = await record(input({ value }));
    expect(r).toMatchObject({
      ok: false,
      error: { code: "input.invalid", details: [{ field: "value" }] },
    });
    expect(measurements.writes).toBe(0);
  });

  it("rejects an unknown quality and an empty note without writing", async () => {
    for (const extra of [{ quality: "super" }, { note: "   " }]) {
      expect((await record(input(extra))).ok).toBe(false);
    }
    expect(measurements.writes).toBe(0);
  });

  it("accepts 0 and the grid 0.5", async () => {
    expect((await record(input({ value: 0 }))).ok).toBe(true);
    expect((await record(input({ value: 0.5 }))).ok).toBe(true);
  });
});

describe("US-WAC-01 Messung erfassen: Datum", () => {
  it("is today in the user's time zone by default", async () => {
    const berlin = await record(input());
    const newYork = await record(input({ timeZone: "America/New_York" }));
    expect(berlin).toMatchObject({ ok: true, value: { date: "2026-10-03" } });
    expect(newYork).toMatchObject({ ok: true, value: { date: "2026-10-02" } });
  });

  it("can be changed (back-filling), also several times on the same day (FR-WAC-07)", async () => {
    const a = await record(input({ date: "2026-09-01" }));
    const b = await record(input({ date: "2026-09-01", value: 13 }));
    expect(a).toMatchObject({ ok: true, value: { date: "2026-09-01" } });
    expect(b.ok).toBe(true);
    expect(measurements.rows).toHaveLength(2);
  });

  it.each(["2026-02-30", "03.10.2026", "2026-13-01", "tomorrow", 20261003])(
    "rejects the invalid date %s without writing",
    async (date) => {
      const r = await record(input({ date }));
      expect(r).toMatchObject({ ok: false, error: { code: "input.invalid" } });
      expect(measurements.writes).toBe(0);
    },
  );

  it("rejects a date in the future (after local today), not today itself", async () => {
    const tomorrow = await record(input({ date: "2026-10-04" }));
    expect(tomorrow).toMatchObject({
      ok: false,
      error: { code: "input.invalid", details: [{ field: "date" }] },
    });
    expect(measurements.writes).toBe(0);
    expect((await record(input({ date: "2026-10-03" }))).ok).toBe(true);
    // In New York 3 October is still tomorrow.
    expect((await record(input({ date: "2026-10-03", timeZone: "America/New_York" }))).ok).toBe(
      false,
    );
  });
});

describe("US-WAC-01 record a measurement: idempotency (US-QS-03) and tenant (P-04)", () => {
  it("the same key writes only once and returns the same result", async () => {
    const a = await record(input(), anna, "same");
    const b = await record(input(), anna, "same");
    expect(measurements.rows).toHaveLength(1);
    expect(b).toEqual(a);
  });

  it("the same key with different input is a conflict and writes nothing", async () => {
    await record(input(), anna, "same");
    const r = await record(input({ value: 20 }), anna, "same");
    expect(r).toMatchObject({ ok: false, error: { code: "idempotency.key_conflict" } });
    expect(measurements.rows).toHaveLength(1);
  });

  it("without key and without sign-in nothing is written", async () => {
    const op = measurementRecord({
      measurements,
      specimens: new SpecimenStub({ anna: [E1] }),
      clock: () => NOW,
    });
    const withoutKey = await execute(
      op,
      { idempotency: idem },
      { context: anna, input: input(), idempotencyKey: undefined },
    );
    const withoutSignIn = await execute(
      op,
      { idempotency: idem },
      { context: { userId: null }, input: input(), idempotencyKey: "k" },
    );
    expect(withoutKey).toMatchObject({
      ok: false,
      error: { code: "idempotency.key_missing" },
    });
    expect(withoutSignIn).toMatchObject({
      ok: false,
      error: { code: "access.not_signed_in" },
    });
    expect(measurements.writes).toBe(0);
  });

  it("a foreign or unknown specimen looks the same and stays untouched", async () => {
    const foreign = await record(input({ specimenId: E2 }), anna);
    const unknown = await record(input({ specimenId: "00000000-0000-4000-8000-0000000000ff" }));
    expect(foreign).toMatchObject({ ok: false, error: { code: "specimen.not_found" } });
    expect(unknown).toEqual(foreign);
    expect(measurements.writes).toBe(0);
  });
});

describe("US-WAC-01 Ansicht „Messen“", () => {
  const view = (user: string, id: string, mass: "height" | null = "height") =>
    measurementView(
      {
        measurements,
        specimens: new SpecimenStub({ anna: [E1], ben: [E2] }),
        species: speciesStub(mass),
      },
      user,
      id,
    );

  it('without measurement: "Was messen?", no last measurement, no rating', async () => {
    expect(await view("anna", E1)).toMatchObject({
      growthMeasure: "height",
      measurements: [],
      last: null,
      lastRating: null,
    });
  });

  it("shows the last measurement by date and its rating, also on back-filling", async () => {
    await record(input({ date: "2026-10-01", value: 20 }));
    await record(input({ date: "2026-09-01", value: 15, quality: "etiolated" }));
    const a = await view("anna", E1);
    expect(a?.last).toMatchObject({ date: "2026-10-01", value: 20 });
    expect(a?.lastRating).toBe("healthy");
    expect(a?.measurements.map((m) => m.value)).toEqual([20, 15]);
  });

  it("names the growth measure of the species; if the species is not visible it stays unknown (P-08)", async () => {
    expect((await view("anna", E1, null))?.growthMeasure).toBeNull();
  });

  it("a foreign, unknown or invalidly written specimen returns nothing", async () => {
    await record(input());
    expect(await view("ben", E1)).toBeNull();
    expect(await view("anna", "00000000-0000-4000-8000-0000000000ff")).toBeNull();
    expect(await view("anna", "no-id")).toBeNull();
  });
});

describe("US-WAC-02 assess etiolation while measuring", () => {
  const view = (signs?: string, mass: "height" | null = "height") =>
    measurementView(
      {
        measurements,
        specimens: new SpecimenStub({ anna: [E1], ben: [E2] }),
        species: speciesStub(mass, signs),
      },
      "anna",
      E1,
    );

  it("the choice is healthy or etiolated/thin, healthy by default", async () => {
    expect(await record(input())).toMatchObject({ ok: true, value: { quality: "healthy" } });
    expect(await record(input({ quality: "etiolated" }))).toMatchObject({
      ok: true,
      value: { quality: "etiolated" },
    });
    expect(await record(input({ quality: "thin" }))).toMatchObject({ ok: false });
    expect(measurements.rows.map((m) => m.quality)).toEqual(["healthy", "etiolated"]);
  });

  it("a measurement without quality (null, legacy data) counts as healthy", async () => {
    expect(await record(input({ quality: null }))).toMatchObject({
      ok: true,
      value: { quality: "healthy" },
    });
  });

  it("the view carries the etiolation signs of the species for the choice field", async () => {
    expect(await view("Triebe werden lang und dünn.")).toMatchObject({
      etiolationSigns: "Triebe werden lang und dünn.",
    });
  });

  it("without visible species or with an empty text the signs stay unknown, nothing is invented (P-08)", async () => {
    expect((await view("Triebe werden lang.", null))?.etiolationSigns).toBeNull();
    expect((await view("   "))?.etiolationSigns).toBeNull();
  });

  it("the last rating stays etiolated/thin when the last measurement is etiolated", async () => {
    await record(input({ date: "2026-09-01", quality: "healthy" }));
    await record(input({ date: "2026-10-01", quality: "etiolated" }));
    expect((await view())?.lastRating).toBe("etiolated");
  });
});

describe("US-BES-07 Messen: archivierte Exemplare", () => {
  it("an archived specimen is not measured (missing in growth), nothing is written", async () => {
    const r = await record(input(), anna, "archived", [E1]);
    expect(r).toMatchObject({ ok: false, error: { code: "specimen.archived" } });
    expect(measurements.writes).toBe(0);
  });
});
