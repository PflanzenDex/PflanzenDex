import { describe, expect, it } from "vitest";
import { execute } from "../../kernel";
import { InMemoryIdempotencyStore } from "../../kernel/test-helpers";
import type { SpecimenRow } from "../../collection";
import { InMemoryFertilizing } from "../test-helpers";
import { fertilizingOf, monitoringFertilize } from "./fertilizing";

const row = (id: string, status: SpecimenRow["status"]) => ({ id, status }) as SpecimenRow;
const PLANT = "00000000-0000-4000-8000-000000000001";
const CUTTING = "00000000-0000-4000-8000-000000000002";
const ARCHIVED = "00000000-0000-4000-8000-000000000003";
const OTHER = "00000000-0000-4000-8000-000000000004";
const UNKNOWN = "00000000-0000-4000-8000-0000000000ff";

const idempotency = new InMemoryIdempotencyStore();
let n = 0;
const call = (userId: string | null, input: unknown, key = `f${++n}`) => ({
  context: { userId, timeZone: "Europe/Berlin" },
  input,
  idempotencyKey: key,
});

const setup = () => {
  const fertilizing = new InMemoryFertilizing();
  const mine = [row(PLANT, "plant"), row(CUTTING, "cutting"), row(ARCHIVED, "archived")];
  // Only the keeper "anna" owns plants; another account gets nothing (P-04).
  const specimens = {
    find: async (u: string, id: string) =>
      u === "anna" ? (mine.find((s) => s.id === id) ?? null) : null,
  };
  const op = monitoringFertilize({
    specimens,
    fertilizing,
    // 2026-11-06 23:30 UTC is already 7 November in Berlin (NFR-08).
    clock: () => new Date("2026-11-06T23:30:00Z"),
  });
  return { op, fertilizing, specimens };
};

describe("US-MON-09 log fertilizing from a pot label", () => {
  it("US-MON-09 logs fertilizing for today in the keeper's time zone and confirms it", async () => {
    const { op, fertilizing } = setup();
    const r = await execute(
      op,
      { idempotency },
      call("anna", { specimenId: PLANT, timeZone: "Europe/Berlin" }),
    );
    expect(r).toMatchObject({
      ok: true,
      value: { date: "2026-11-07", specimenId: PLANT, created: 1 },
    });
    expect([...fertilizing.entries]).toEqual([`anna|${PLANT}|2026-11-07`]);
  });

  it("US-MON-09 a repeat on the same day, or the same call repeated, leaves one entry (US-QS-03)", async () => {
    const { op, fertilizing } = setup();
    const input = { specimenId: PLANT, timeZone: "Europe/Berlin" };
    await execute(op, { idempotency }, call("anna", input));
    const again = await execute(op, { idempotency }, call("anna", input));
    expect(again).toMatchObject({ ok: true, value: { created: 0 } });
    expect(fertilizing.entries.size).toBe(1);
  });

  it("US-MON-09 an archived plant is refused and nothing is written", async () => {
    const { op, fertilizing } = setup();
    const r = await execute(
      op,
      { idempotency },
      call("anna", { specimenId: ARCHIVED, timeZone: "UTC" }),
    );
    expect(r).toMatchObject({ ok: false, error: { code: "specimen.archived" } });
    expect(fertilizing.entries.size).toBe(0);
  });

  it("US-MON-09 a plant of another account and an unknown plant give the same not-found answer and write nothing (P-04, P-05)", async () => {
    const { op, fertilizing } = setup();
    const foreign = await execute(
      op,
      { idempotency },
      call("ben", { specimenId: PLANT, timeZone: "UTC" }),
    );
    const unknown = await execute(
      op,
      { idempotency },
      call("anna", { specimenId: UNKNOWN, timeZone: "UTC" }),
    );
    expect(foreign).toMatchObject({ ok: false, error: { code: "specimen.not_found" } });
    expect(unknown).toMatchObject({ ok: false, error: { code: "specimen.not_found" } });
    // The error echoes the id that was sent, so only code and text must be the same (P-05).
    const answer = (r: typeof foreign) =>
      r.ok ? null : { code: r.error.code, text: r.error.text };
    expect(answer(foreign)).toEqual(answer(unknown));
    expect(fertilizing.entries.size).toBe(0);
  });

  it("US-MON-09 refuses an invalid id or time zone, and a missing sign-in, with nothing written", async () => {
    const { op, fertilizing } = setup();
    expect(
      await execute(
        op,
        { idempotency },
        call("anna", { specimenId: "not-an-id", timeZone: "UTC" }),
      ),
    ).toMatchObject({ ok: false, error: { code: "input.invalid" } });
    expect(
      await execute(op, { idempotency }, call("anna", { specimenId: PLANT, timeZone: "x" })),
    ).toMatchObject({ ok: false, error: { code: "input.invalid" } });
    expect(
      await execute(op, { idempotency }, call(null, { specimenId: PLANT, timeZone: "UTC" })),
    ).toMatchObject({ ok: false, error: { code: "access.not_signed_in" } });
    expect(fertilizing.entries.size).toBe(0);
  });
});

describe("US-MON-09 the label page shows when the plant was last fertilized", () => {
  it("US-MON-09 shows the latest date, or nothing logged yet as null (P-08)", async () => {
    const { fertilizing, specimens } = setup();
    const deps = { specimens, fertilizing };
    expect(await fertilizingOf(deps, "anna", PLANT)).toEqual({
      ok: true,
      value: { lastFertilizedOn: null },
    });
    await fertilizing.record("anna", [
      { specimenId: PLANT, date: "2026-10-01" },
      { specimenId: PLANT, date: "2026-11-02" },
    ]);
    expect(await fertilizingOf(deps, "anna", PLANT)).toEqual({
      ok: true,
      value: { lastFertilizedOn: "2026-11-02" },
    });
  });

  it("US-MON-09 an archived plant is still read; a foreign, unknown or malformed id is not found (P-05)", async () => {
    const { fertilizing, specimens } = setup();
    const deps = { specimens, fertilizing };
    expect(await fertilizingOf(deps, "anna", ARCHIVED)).toMatchObject({ ok: true });
    expect(await fertilizingOf(deps, "ben", PLANT)).toMatchObject({
      ok: false,
      error: { code: "specimen.not_found" },
    });
    expect(await fertilizingOf(deps, "anna", OTHER)).toMatchObject({
      ok: false,
      error: { code: "specimen.not_found" },
    });
    expect(await fertilizingOf(deps, "anna", "x")).toMatchObject({
      ok: false,
      error: { code: "specimen.not_found" },
    });
  });
});
