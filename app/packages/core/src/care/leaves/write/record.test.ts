import { beforeEach, describe, expect, it } from "vitest";
import { execute } from "../../../kernel/operation";
import { InMemoryIdempotencyStore } from "../../../kernel/test-helpers";
import { leafRecord } from "../../index";
import { SpecimenStub } from "../../shared/test-helpers";
import { InMemoryLeaves } from "../../shared/leaf-test-helpers";

const E1 = "00000000-0000-4000-8000-000000000001";
const E2 = "00000000-0000-4000-8000-000000000002";
const anna = { userId: "anna" };
// 2026-10-02 23:30 UTC: already 3 October in Berlin, still 2 October in New York (NFR-08).
const NOW = new Date("2026-10-02T23:30:00Z");

let leaves: InMemoryLeaves;
let idem: InMemoryIdempotencyStore;
let counter = 0;
let switchedOff = false;
let archived: readonly string[] = [];

const record = (input: unknown, context = anna, key = `k${++counter}`) =>
  execute(
    leafRecord({
      leaves,
      specimens: new SpecimenStub({ anna: [E1], ben: [E2] }, archived),
      keeperOff: async () => switchedOff,
      clock: () => NOW,
    }),
    { idempotency: idem },
    { context, input, idempotencyKey: key },
  );
const input = (extra: Record<string, unknown> = {}) => ({
  specimenId: E1,
  timeZone: "Europe/Berlin",
  ...extra,
});

beforeEach(() => {
  leaves = new InMemoryLeaves({ anna: [E1], ben: [E2] });
  idem = new InMemoryIdempotencyStore();
  switchedOff = false;
  archived = [];
});

describe("US-WAC-07 record a leaf", () => {
  it("US-WAC-07 one tap records a leaf with today's local date and no size or note", async () => {
    const r = await record(input());
    expect(r).toMatchObject({
      ok: true,
      value: { specimenId: E1, date: "2026-10-03", lengthMm: null, widthMm: null, note: null },
    });
    expect(leaves.rows).toHaveLength(1);
  });

  it("US-WAC-07 a size, a note and an earlier date are optional and stored when given", async () => {
    const r = await record(
      input({ date: "2026-09-20", lengthMm: 42, widthMm: 11, note: "  Fensterung an der Spitze " }),
    );
    expect(r).toMatchObject({
      ok: true,
      value: {
        specimenId: E1,
        date: "2026-09-20",
        lengthMm: 42,
        widthMm: 11,
        note: "Fensterung an der Spitze",
      },
    });
  });

  it("US-WAC-07 a leaf with only a length is stored with no width", async () => {
    const r = await record(input({ lengthMm: 30 }));
    expect(r).toMatchObject({ ok: true, value: { lengthMm: 30, widthMm: null } });
  });

  it("US-WAC-07 a date in the future is refused with leaf.date_in_future and nothing is written", async () => {
    const r = await record(input({ date: "2026-10-04" }));
    expect(r).toMatchObject({
      ok: false,
      error: { code: "leaf.date_in_future", details: [{ field: "date" }] },
    });
    expect(leaves.writes).toBe(0);
  });

  it("US-WAC-07 today is the keeper's local date at a UTC day boundary, not the UTC date", async () => {
    const berlin = await record(input());
    const newYork = await record(input({ timeZone: "America/New_York" }));
    expect(berlin).toMatchObject({ ok: true, value: { date: "2026-10-03" } });
    expect(newYork).toMatchObject({ ok: true, value: { date: "2026-10-02" } });
    // In New York 3 October is still tomorrow.
    expect(await record(input({ date: "2026-10-03", timeZone: "America/New_York" }))).toMatchObject(
      { ok: false, error: { code: "leaf.date_in_future" } },
    );
  });

  it("US-WAC-07 an invalid date or time zone is refused as input and writes nothing", async () => {
    for (const extra of [
      { date: "2026-02-30" },
      { date: "03.10.2026" },
      { timeZone: "Mars/Olymp" },
    ]) {
      expect((await record(input(extra))).ok).toBe(false);
    }
    expect(leaves.writes).toBe(0);
  });

  it.each([
    ["zero", 0],
    ["above the limit", 5_001],
    ["fractional", 12.5],
    ["negative", -3],
    ["a text", "40"],
    ["infinite", Infinity],
  ])(
    "US-WAC-07 a length that is %s is refused with leaf.size_invalid and nothing is written",
    async (_, lengthMm) => {
      const r = await record(input({ lengthMm }));
      expect(r).toMatchObject({
        ok: false,
        error: { code: "leaf.size_invalid", details: [{ field: "lengthMm" }] },
      });
      expect(leaves.writes).toBe(0);
    },
  );

  it("US-WAC-07 a width outside 1 to 5,000 millimetres is refused with leaf.size_invalid", async () => {
    for (const widthMm of [0, 5_001]) {
      const r = await record(input({ widthMm }));
      expect(r).toMatchObject({
        ok: false,
        error: { code: "leaf.size_invalid", details: [{ field: "widthMm" }] },
      });
    }
    expect(leaves.writes).toBe(0);
  });

  it("US-WAC-07 the size limits 1 and 5,000 are accepted", async () => {
    expect((await record(input({ lengthMm: 1, widthMm: 5_000 }))).ok).toBe(true);
  });

  it("US-WAC-07 a note of 500 characters is accepted, 501 or a blank note is refused with leaf.note_invalid", async () => {
    expect((await record(input({ note: "a".repeat(500) }))).ok).toBe(true);
    const tooLong = await record(input({ note: "a".repeat(501) }));
    expect(tooLong).toMatchObject({
      ok: false,
      error: { code: "leaf.note_invalid", details: [{ field: "note" }] },
    });
    const blank = await record(input({ note: "   " }));
    expect(blank).toMatchObject({ ok: false, error: { code: "leaf.note_invalid" } });
    expect(leaves.writes).toBe(1);
  });

  it("US-WAC-07 a foreign or unknown specimen is specimen.not_found and nothing is written (P-04)", async () => {
    expect(await record(input({ specimenId: E2 }))).toMatchObject({
      ok: false,
      error: { code: "specimen.not_found" },
    });
    expect(
      await record(input({ specimenId: "00000000-0000-4000-8000-0000000000ff" })),
    ).toMatchObject({
      ok: false,
      error: { code: "specimen.not_found" },
    });
    expect(leaves.rows).toHaveLength(0);
  });

  it("US-WAC-07 an archived specimen takes no leaf (specimen.archived)", async () => {
    archived = [E1];
    expect(await record(input())).toMatchObject({
      ok: false,
      error: { code: "specimen.archived" },
    });
    expect(leaves.rows).toHaveLength(0);
  });

  it("US-WAC-07 with the keeper switch off nothing is written and the refusal names the switch (P-12)", async () => {
    switchedOff = true;
    const r = await record(input());
    expect(r).toMatchObject({
      ok: false,
      error: { code: "onboarding.keeper_off", data: { id: "leaf_log" } },
    });
    expect(leaves.writes).toBe(0);
  });

  it("US-WAC-07 the same key writes once and returns the same result (US-QS-03)", async () => {
    const a = await record(input({ lengthMm: 20 }), anna, "same");
    const b = await record(input({ lengthMm: 20 }), anna, "same");
    expect(leaves.rows).toHaveLength(1);
    expect(b).toEqual(a);
  });

  it("US-WAC-07 without an Idempotency-Key nothing is written", async () => {
    const r = await execute(
      leafRecord({
        leaves,
        specimens: new SpecimenStub({ anna: [E1] }),
        keeperOff: async () => false,
        clock: () => NOW,
      }),
      { idempotency: idem },
      { context: anna, input: input(), idempotencyKey: undefined },
    );
    expect(r).toMatchObject({ ok: false, error: { code: "idempotency.key_missing" } });
    expect(leaves.writes).toBe(0);
  });
});
