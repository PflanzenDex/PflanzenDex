import { describe, expect, it } from "vitest";
import { execute } from "../../kernel";
import { InMemoryIdempotencyStore } from "../../kernel/test-helpers";
import type { SpecimenRow } from "../../collection";
import { InMemoryWatering } from "../test-helpers";
import {
  monitoringWater,
  wateringDue,
  wateringOccasions,
  type WateringCandidate,
} from "./watering";

const cand = (over: Partial<WateringCandidate> = {}): WateringCandidate => ({
  specimenId: "s1",
  name: "Ficus",
  intervalDays: 7,
  lastWateredOn: "2026-10-03",
  since: "2026-01-01",
  ...over,
});

describe("US-MON-05 when a specimen is due", () => {
  it("US-MON-05 is due when the last entry plus the interval of the phase is today or earlier", () => {
    expect(wateringDue([cand()], "2026-10-09")).toEqual([]);
    expect(wateringDue([cand()], "2026-10-10")).toMatchObject([{ specimenId: "s1", daysSince: 7 }]);
    expect(wateringDue([cand()], "2026-10-20")).toMatchObject([{ daysSince: 17 }]);
  });

  it("US-MON-05 without an interval for the phase nothing is invented and nothing is reported (P-08)", () => {
    expect(wateringDue([cand({ intervalDays: null })], "2027-01-01")).toEqual([]);
  });

  it("US-MON-05 without a log entry the catch date is the start, without any date nothing is reported", () => {
    const never = cand({ lastWateredOn: null, since: "2026-10-01" });
    expect(wateringDue([never], "2026-10-08")).toMatchObject([{ lastWateredOn: null }]);
    expect(wateringDue([never], "2026-10-07")).toEqual([]);
    expect(wateringDue([cand({ lastWateredOn: null, since: null })], "2027-01-01")).toEqual([]);
  });

  it("US-MON-05 the most overdue comes first, then by name", () => {
    const list = wateringDue(
      [
        cand({ specimenId: "b", name: "Bambus", lastWateredOn: "2026-10-01" }),
        cand({ specimenId: "a", name: "Aloe", lastWateredOn: "2026-10-01" }),
        cand({ specimenId: "c", name: "Cissus", lastWateredOn: "2026-09-01" }),
      ],
      "2026-10-20",
    );
    expect(list.map((d) => d.specimenId)).toEqual(["c", "a", "b"]);
  });

  it("US-MON-05 the occasion has a stable id per specimen, says what was and what to do next", () => {
    const [seen, never] = wateringOccasions([
      ...wateringDue([cand()], "2026-10-10"),
      ...wateringDue(
        [cand({ specimenId: "s2", lastWateredOn: null, since: "2026-10-01" })],
        "2026-10-10",
      ),
    ]);
    expect(seen).toMatchObject({ id: "watering:s1", occasion: "watering" });
    expect(seen?.text).toContain("vor 7 Tagen");
    expect(never?.text).toContain("noch nie als gegossen eingetragen");
    expect(seen?.nextAction).toContain("trage es als gegossen ein");
  });
});

const row = (id: string, status: SpecimenRow["status"]) => ({ id, status }) as SpecimenRow;
const idempotency = new InMemoryIdempotencyStore();
let n = 0;
const call = (userId: string | null, input: unknown, key = `k${++n}`) => ({
  context: { userId, timeZone: "Europe/Berlin" },
  input,
  idempotencyKey: key,
});
const setup = () => {
  const watering = new InMemoryWatering();
  const mine = [
    row("00000000-0000-4000-8000-000000000001", "plant"),
    row("00000000-0000-4000-8000-000000000002", "cutting"),
    row("00000000-0000-4000-8000-000000000003", "archived"),
  ];
  const op = monitoringWater({
    specimens: { list: async (u) => (u === "anna" ? mine : []) },
    watering,
    // 2026-10-10 23:30 UTC is already 11 October in Berlin (NFR-08).
    clock: () => new Date("2026-10-10T23:30:00Z"),
  });
  return { op, watering };
};

describe("US-MON-05 log 'watered'", () => {
  it("US-MON-05 writes one entry per specimen on the local date, several in one step", async () => {
    const { op, watering } = setup();
    const r = await execute(
      op,
      { idempotency },
      call("anna", {
        specimenIds: [
          "00000000-0000-4000-8000-000000000001",
          "00000000-0000-4000-8000-000000000002",
        ],
        timeZone: "Europe/Berlin",
      }),
    );
    expect(r).toMatchObject({ ok: true, value: { date: "2026-10-11", created: 2 } });
    expect([
      ...(await watering.lastWatered("anna", [
        "00000000-0000-4000-8000-000000000001",
        "00000000-0000-4000-8000-000000000002",
      ])),
    ]).toEqual([
      ["00000000-0000-4000-8000-000000000001", "2026-10-11"],
      ["00000000-0000-4000-8000-000000000002", "2026-10-11"],
    ]);
  });

  it("US-MON-05 a repeat or the same specimen twice writes once (US-QS-03)", async () => {
    const { op, watering } = setup();
    const input = {
      specimenIds: ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000001"],
      timeZone: "Europe/Berlin",
    };
    await execute(op, { idempotency }, call("anna", input));
    const again = await execute(op, { idempotency }, call("anna", input));
    expect(again).toMatchObject({ ok: true, value: { created: 0 } });
    expect(watering.entries.size).toBe(1);
  });

  it("US-MON-05 an archived or foreign specimen stops the whole step and writes nothing", async () => {
    const { op, watering } = setup();
    const archived = await execute(
      op,
      { idempotency },
      call("anna", {
        specimenIds: [
          "00000000-0000-4000-8000-000000000001",
          "00000000-0000-4000-8000-000000000003",
        ],
        timeZone: "UTC",
      }),
    );
    expect(archived).toMatchObject({ ok: false, error: { code: "specimen.archived" } });
    const foreign = await execute(
      op,
      { idempotency },
      call("ben", { specimenIds: ["00000000-0000-4000-8000-000000000001"], timeZone: "UTC" }),
    );
    expect(foreign).toMatchObject({ ok: false, error: { code: "specimen.not_found" } });
    expect(watering.entries.size).toBe(0);
  });

  it("US-MON-05 refuses an empty list, a bad zone and a missing sign-in", async () => {
    const { op } = setup();
    for (const bad of [
      { specimenIds: [], timeZone: "UTC" },
      { specimenIds: ["00000000-0000-4000-8000-000000000001"], timeZone: "x" },
    ])
      expect(await execute(op, { idempotency }, call("anna", bad))).toMatchObject({
        ok: false,
        error: { code: "input.invalid" },
      });
    expect(
      await execute(
        op,
        { idempotency },
        call(null, { specimenIds: ["00000000-0000-4000-8000-000000000001"], timeZone: "UTC" }),
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "access.not_signed_in" },
    });
  });
});
