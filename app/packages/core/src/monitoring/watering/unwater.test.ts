import { beforeEach, describe, expect, it } from "vitest";
import { execute } from "../../kernel";
import { InMemoryIdempotencyStore } from "../../kernel/test-helpers";
import type { SpecimenRow } from "../../collection";
import { InMemoryWatering } from "../test-helpers";
import { monitoringUnwater } from "./unwater";
import { MAX_WATERED, monitoringWater } from "./watering";

const S1 = "00000000-0000-4000-8000-000000000001";
const S2 = "00000000-0000-4000-8000-000000000002";
const SB = "00000000-0000-4000-8000-0000000000b1";
const SARCH = "00000000-0000-4000-8000-0000000000c1";
// 2026-10-10 23:30 UTC: 11 October in Berlin, still 10 October in Los Angeles (NFR-08).
const clock = () => new Date("2026-10-10T23:30:00Z");

const row = (id: string, status: SpecimenRow["status"]) => ({ id, status }) as SpecimenRow;
const specimens = {
  list: async (userId: string) =>
    userId === "anna"
      ? [row(S1, "plant"), row(S2, "plant"), row(SARCH, "archived")]
      : [row(SB, "plant")],
};

let idempotency: InMemoryIdempotencyStore;
let watering: InMemoryWatering;
let counter = 0;
const unwater = (input: unknown, userId = "anna") =>
  execute(
    monitoringUnwater({ specimens, watering, clock }),
    { idempotency },
    {
      context: { userId },
      input,
      idempotencyKey: `u${++counter}`,
    },
  );
const water = (ids: string[], userId = "anna") =>
  execute(
    monitoringWater({ specimens, watering, clock }),
    { idempotency },
    {
      context: { userId },
      input: { specimenIds: ids, timeZone: "Europe/Berlin" },
      idempotencyKey: `w${++counter}`,
    },
  );

beforeEach(() => {
  idempotency = new InMemoryIdempotencyStore();
  watering = new InMemoryWatering();
  counter = 0;
});

describe("US-QS-32 undo of 'Gegossen' (monitoring.unwater)", () => {
  it("US-QS-32 removes today's entry of the given own specimen and keeps the other ones", async () => {
    watering.entries.add(`anna|${S1}|2026-10-11`);
    watering.entries.add(`anna|${S2}|2026-10-11`);
    watering.entries.add(`anna|${S1}|2026-10-10`);
    const r = await unwater({ specimenIds: [S1], timeZone: "Europe/Berlin" });
    expect(r).toMatchObject({ ok: true, value: { date: "2026-10-11", removed: 1 } });
    expect([...watering.entries].sort()).toEqual([
      `anna|${S1}|2026-10-10`,
      `anna|${S2}|2026-10-11`,
    ]);
  });

  it("US-QS-32 today is the local date in the given time zone, not the UTC date (NFR-08)", async () => {
    watering.entries.add(`anna|${S1}|2026-10-10`);
    watering.entries.add(`anna|${S1}|2026-10-11`);
    const r = await unwater({ specimenIds: [S1], timeZone: "America/Los_Angeles" });
    expect(r).toMatchObject({ ok: true, value: { date: "2026-10-10", removed: 1 } });
    expect([...watering.entries]).toEqual([`anna|${S1}|2026-10-11`]);
  });

  it("US-QS-32 undoes what 'Gegossen' wrote: one step, then the same entry is gone", async () => {
    const wrote = await water([S1, S2]);
    expect(wrote).toMatchObject({ ok: true, value: { created: 2 } });
    const undone = await unwater({ specimenIds: [S1, S2], timeZone: "Europe/Berlin" });
    expect(undone).toMatchObject({ ok: true, value: { removed: 2 } });
    expect(watering.entries.size).toBe(0);
  });

  it("US-QS-32 a repeat finds nothing to remove and is not an error (idempotent)", async () => {
    watering.entries.add(`anna|${S1}|2026-10-11`);
    await unwater({ specimenIds: [S1], timeZone: "Europe/Berlin" });
    const again = await unwater({ specimenIds: [S1], timeZone: "Europe/Berlin" });
    expect(again).toMatchObject({ ok: true, value: { removed: 0 } });
  });

  it("US-QS-32 a foreign specimen looks unknown, nothing of the other account is removed (P-04)", async () => {
    watering.entries.add(`ben|${SB}|2026-10-11`);
    const r = await unwater({ specimenIds: [SB], timeZone: "Europe/Berlin" });
    expect(r.ok === false && r.error.code).toBe("specimen.not_found");
    expect(watering.entries.has(`ben|${SB}|2026-10-11`)).toBe(true);
  });

  it("US-QS-32 an unknown specimen is refused as not found and nothing is removed", async () => {
    watering.entries.add(`anna|${S1}|2026-10-11`);
    const r = await unwater({
      specimenIds: [S1, "00000000-0000-4000-8000-0000000000ff"],
      timeZone: "Europe/Berlin",
    });
    expect(r.ok === false && r.error.code).toBe("specimen.not_found");
    expect(watering.entries.has(`anna|${S1}|2026-10-11`)).toBe(true);
  });

  it("US-QS-32 an archived specimen is refused as archived (the same rule as 'Gegossen')", async () => {
    const r = await unwater({ specimenIds: [SARCH], timeZone: "Europe/Berlin" });
    expect(r.ok === false && r.error.code).toBe("specimen.archived");
  });

  it("US-QS-32 the limit is the one of 'Gegossen': more specimens than MAX_WATERED are invalid", async () => {
    const many = Array.from(
      { length: MAX_WATERED + 1 },
      (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    );
    const r = await unwater({ specimenIds: many, timeZone: "Europe/Berlin" });
    expect(r.ok === false && r.error.code).toBe("input.invalid");
  });

  it.each([
    ["no time zone", { specimenIds: [S1] }],
    ["unknown time zone", { specimenIds: [S1], timeZone: "Mars/Olympus" }],
  ])("US-QS-32 invalid input (%s) removes nothing", async (_, input) => {
    watering.entries.add(`anna|${S1}|2026-10-11`);
    const r = await unwater(input);
    expect(r.ok === false && r.error.code).toBe("input.invalid");
    expect(watering.entries.size).toBe(1);
  });
});
