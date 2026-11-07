import { beforeEach, describe, expect, it } from "vitest";
import { execute } from "../../kernel";
import { InMemoryIdempotencyStore } from "../../kernel/test-helpers";
import { specimenRepot } from "../index";
import { specimenTickRepotSign, specimenUntickRepotSign } from "../repot";
import { InMemorySpecimens } from "../shared/test-helpers";

const SPECIES = "11111111-1111-4111-8111-111111111111";
const anna = { userId: "anna" };
const ben = { userId: "ben" };

let specimens: InMemorySpecimens;
let idem: InMemoryIdempotencyStore;
let counter = 0;

const repot = (
  specimenId: string,
  opt: { context?: { userId: string | null }; key?: string } = {},
) =>
  execute(
    specimenRepot({ specimens }),
    { idempotency: idem },
    {
      context: opt.context ?? anna,
      input: { specimenId },
      idempotencyKey: opt.key ?? `k${++counter}`,
    },
  );

const create = async (userId: string, name: string, status: "plant" | "cutting") => {
  const r = await specimens.create(userId, {
    speciesId: SPECIES,
    name,
    marker: null,
    locationId: null,
    caughtAt: "2026-09-01",
    status,
  });
  if (typeof r === "string") throw new Error(r);
  return r;
};

beforeEach(() => {
  specimens = new InMemorySpecimens();
  idem = new InMemoryIdempotencyStore();
});

describe("US-SOZ-05 the day of the repot is recorded as a local date", () => {
  it("records today in the given time zone, not UTC (NFR-08); without a time zone no date is guessed (P-08)", async () => {
    const withZone = await create("anna", "Bogenhanf", "cutting");
    const noZone = await create("anna", "Bogenhanf 2", "cutting");
    const run = (specimenId: string, input: object) =>
      execute(
        specimenRepot({ specimens, clock: () => new Date("2026-10-09T23:30:00Z") }),
        { idempotency: idem },
        { context: anna, input: { specimenId, ...input }, idempotencyKey: `k${++counter}` },
      );
    expect((await run(withZone.id, { timeZone: "Europe/Berlin" })).ok).toBe(true);
    expect((await specimens.find("anna", withZone.id))?.repottedAt).toBe("2026-10-10");
    expect((await run(noZone.id, {})).ok).toBe(true);
    expect((await specimens.find("anna", noZone.id))?.repottedAt).toBeNull();
  });

  it("refuses an invalid time zone", async () => {
    const c = await create("anna", "Bogenhanf", "cutting");
    const r = await execute(
      specimenRepot({ specimens }),
      { idempotency: idem },
      {
        context: anna,
        input: { specimenId: c.id, timeZone: "Mars/Base" },
        idempotencyKey: `k${++counter}`,
      },
    );
    expect(!r.ok && r.error.code).toBe("input.invalid");
  });
});

describe("US-BES-04 repotted", () => {
  it("US-BES-04: a cutting becomes a plant, everything else stays unchanged", async () => {
    const cutting = await create("anna", "Bogenhanf", "cutting");
    const r = await repot(cutting.id);
    expect(r.ok && r.value).toEqual({ ...cutting, status: "plant", repottedAt: null });
  });

  it("US-BES-19: a plant is repotted too: the status and its repot day stay, the repot is recorded", async () => {
    const plant = await create("anna", "Bogenhanf", "plant");
    const r = await execute(
      specimenRepot({ specimens, clock: () => new Date("2026-10-09T23:30:00Z") }),
      { idempotency: idem },
      {
        context: anna,
        input: { specimenId: plant.id, timeZone: "Europe/Berlin" },
        idempotencyKey: `k${++counter}`,
      },
    );
    expect(r.ok && r.value).toEqual(plant);
    expect(specimens.repotLog.repots).toEqual([
      { userId: "anna", specimenId: plant.id, repottedOn: "2026-10-10" },
    ]);
    expect((await specimens.find("anna", plant.id))?.repottedAt ?? null).toBeNull();
  });

  it("US-BES-19: a plant without a time zone has no repot day and is refused, nothing is written (P-08)", async () => {
    const plant = await create("anna", "Bogenhanf", "plant");
    const before = specimens.writes;
    const r = await repot(plant.id);
    expect(!r.ok && r.error.code).toBe("input.invalid");
    expect(!r.ok && r.error.details).toEqual([{ field: "timeZone", code: "input.invalid" }]);
    expect(specimens.writes).toBe(before);
    expect(specimens.repotLog.repots).toEqual([]);
  });

  it("US-BES-04: an archived cutting is not repotted (US-BES-07: the specimen is read only)", async () => {
    const cutting = await create("anna", "Bogenhanf", "cutting");
    await specimens.archive("anna", cutting.id, "abgegeben", "2026-10-01");
    const r = await repot(cutting.id);
    expect(!r.ok && r.error.code).toBe("specimen.archived");
    expect((await specimens.find("anna", cutting.id))?.status).toBe("archived");
  });

  it("US-BES-04: a cutting of another account looks like an unknown one (P-04)", async () => {
    const foreign = await create("ben", "Bogenhanf", "cutting");
    const r = await repot(foreign.id, { context: anna });
    expect(!r.ok && r.error.code).toBe("specimen.not_found");
    expect((await specimens.find("ben", foreign.id))?.status).toBe("cutting");
    expect((await repot(foreign.id, { context: ben })).ok).toBe(true);
  });

  it("US-BES-04: an unknown id is not found, an invalid one is rejected", async () => {
    const r = await repot("00000000-0000-4000-8000-0000000000ff");
    expect(!r.ok && r.error.code).toBe("specimen.not_found");
    const invalid = await repot("broken");
    expect(!invalid.ok && invalid.error.details).toEqual([
      { field: "specimenId", code: "input.invalid" },
    ]);
  });

  it("US-BES-04: the same request with the same key repeats the first answer (P-03)", async () => {
    const cutting = await create("anna", "Bogenhanf", "cutting");
    const first = await repot(cutting.id, { key: "same" });
    const before = specimens.writes;
    const second = await repot(cutting.id, { key: "same" });
    expect(second).toEqual(first);
    expect(specimens.writes).toBe(before);
  });

  it("US-BES-04: without sign-in it is refused", async () => {
    const cutting = await create("anna", "Bogenhanf", "cutting");
    const r = await repot(cutting.id, { context: { userId: null } });
    expect(r.ok).toBe(false);
    expect((await specimens.find("anna", cutting.id))?.status).toBe("cutting");
  });
});

describe("US-BES-04 the repot date is chosen by the keeper (local calendar date, NFR-08)", () => {
  // The clock is 23:30 UTC on 9 October, which is already 10 October in Berlin: "today" is the local day.
  const at = (specimenId: string, input: object) =>
    execute(
      specimenRepot({ specimens, clock: () => new Date("2026-10-09T23:30:00Z") }),
      { idempotency: idem },
      { context: anna, input: { specimenId, ...input }, idempotencyKey: `k${++counter}` },
    );

  it("US-BES-04: a chosen past date is recorded as the repot day", async () => {
    const cutting = await create("anna", "Bogenhanf", "cutting");
    const r = await at(cutting.id, { timeZone: "Europe/Berlin", date: "2026-09-30" });
    expect(r.ok).toBe(true);
    expect((await specimens.find("anna", cutting.id))?.repottedAt).toBe("2026-09-30");
    expect((await specimens.find("anna", cutting.id))?.status).toBe("plant");
  });

  it("US-BES-04: today in the keeper's time zone is allowed, tomorrow there is refused", async () => {
    const today = await create("anna", "Bogenhanf", "cutting");
    expect((await at(today.id, { timeZone: "Europe/Berlin", date: "2026-10-10" })).ok).toBe(true);
    const tomorrow = await create("anna", "Bogenhanf 2", "cutting");
    const r = await at(tomorrow.id, { timeZone: "Europe/Berlin", date: "2026-10-11" });
    expect(!r.ok && r.error.code).toBe("specimen.repotted_in_future");
    expect(!r.ok && r.error.details).toEqual([
      { field: "date", code: "specimen.repotted_in_future" },
    ]);
  });

  it("US-BES-04: a future date writes nothing, the cutting stays a cutting", async () => {
    const cutting = await create("anna", "Bogenhanf", "cutting");
    const before = specimens.writes;
    await at(cutting.id, { timeZone: "Europe/Berlin", date: "2026-12-24" });
    expect(specimens.writes).toBe(before);
    const kept = await specimens.find("anna", cutting.id);
    expect(kept?.status).toBe("cutting");
    expect(kept?.repottedAt ?? null).toBeNull();
  });

  it("US-BES-04: a date that is no calendar day or lies before 1900 is input.invalid on the field date", async () => {
    const cutting = await create("anna", "Bogenhanf", "cutting");
    for (const date of ["2026-02-30", "09.10.2026", "1899-12-31"]) {
      const r = await at(cutting.id, { timeZone: "Europe/Berlin", date });
      expect(!r.ok && r.error.details).toEqual([{ field: "date", code: "input.invalid" }]);
    }
    expect((await specimens.find("anna", cutting.id))?.status).toBe("cutting");
  });

  it("US-BES-04: a chosen date without a time zone is refused, nothing is guessed (P-08)", async () => {
    const cutting = await create("anna", "Bogenhanf", "cutting");
    const r = await at(cutting.id, { date: "2026-09-30" });
    expect(!r.ok && r.error.code).toBe("input.invalid");
    expect((await specimens.find("anna", cutting.id))?.status).toBe("cutting");
  });

  it("US-BES-04: without a date today is recorded as before (older clients keep working)", async () => {
    const cutting = await create("anna", "Bogenhanf", "cutting");
    expect((await at(cutting.id, { timeZone: "Europe/Berlin" })).ok).toBe(true);
    expect((await specimens.find("anna", cutting.id))?.repottedAt).toBe("2026-10-10");
  });
});

describe("US-BES-04 the chosen day is not before the catch date (issue 1103)", () => {
  // The clock is 23:30 UTC on 9 October: "today" in Berlin is 10 October. The catch date of `create` is 1 September.
  const chosen = (specimenId: string, input: object, userId: { userId: string } = anna) =>
    execute(
      specimenRepot({ specimens, clock: () => new Date("2026-10-09T23:30:00Z") }),
      { idempotency: idem },
      { context: userId, input: { specimenId, ...input }, idempotencyKey: `k${++counter}` },
    );

  it("US-BES-04: a day before the catch date is refused on the field date and nothing is written", async () => {
    const cutting = await create("anna", "Bogenhanf", "cutting");
    const before = specimens.writes;
    const r = await chosen(cutting.id, { timeZone: "Europe/Berlin", date: "2026-08-31" });
    expect(!r.ok && r.error.code).toBe("specimen.repotted_before_caught");
    expect(!r.ok && r.error.details).toEqual([
      { field: "date", code: "specimen.repotted_before_caught" },
    ]);
    expect(specimens.writes).toBe(before);
    expect((await specimens.find("anna", cutting.id))?.status).toBe("cutting");
  });

  it("US-BES-04: the catch day itself is a valid repot day", async () => {
    const cutting = await create("anna", "Bogenhanf", "cutting");
    const r = await chosen(cutting.id, { timeZone: "Europe/Berlin", date: "2026-09-01" });
    expect(r.ok).toBe(true);
    expect((await specimens.find("anna", cutting.id))?.repottedAt).toBe("2026-09-01");
  });

  it("US-BES-04: a specimen without a catch date accepts any past day (unknown, P-08)", async () => {
    const unknown = await specimens.create("anna", {
      speciesId: SPECIES,
      name: "Ohne Fangdatum",
      marker: null,
      locationId: null,
      caughtAt: null,
      status: "cutting",
    });
    if (typeof unknown === "string") throw new Error(unknown);
    const r = await chosen(unknown.id, { timeZone: "Europe/Berlin", date: "1900-01-01" });
    expect(r.ok).toBe(true);
    expect((await specimens.find("anna", unknown.id))?.repottedAt).toBe("1900-01-01");
  });

  it("US-BES-04, P-04: a foreign cutting looks unknown, not as a date conflict", async () => {
    const foreign = await create("ben", "Bogenhanf", "cutting");
    const r = await chosen(foreign.id, { timeZone: "Europe/Berlin", date: "2026-08-01" });
    expect(!r.ok && r.error.code).toBe("specimen.not_found");
    expect((await specimens.find("ben", foreign.id))?.status).toBe("cutting");
  });
});

describe("US-BES-19 a repot records the day and clears the open repot observations", () => {
  const at = (specimenId: string, input: object = {}) =>
    execute(
      specimenRepot({ specimens, clock: () => new Date("2026-10-09T23:30:00Z") }),
      { idempotency: idem },
      {
        context: anna,
        input: { specimenId, timeZone: "Europe/Berlin", ...input },
        idempotencyKey: `k${++counter}`,
      },
    );
  const tick = (specimenId: string, sign: "roots_out" | "dries_fast" | "tips_over", day: string) =>
    execute(
      specimenTickRepotSign({
        repots: specimens.repotLog,
        keeperOff: async () => false,
        clock: () => new Date(`${day}T10:00:00Z`),
      }),
      { idempotency: idem },
      {
        context: anna,
        input: { specimenId, sign, timeZone: "Europe/Berlin" },
        idempotencyKey: `k${++counter}`,
      },
    );

  it("US-BES-19: a repot clears every open observation of the plant on its day, and the history keeps them", async () => {
    const plant = await create("anna", "Bogenhanf", "plant");
    await tick(plant.id, "roots_out", "2026-09-20");
    await tick(plant.id, "tips_over", "2026-09-21");
    expect((await at(plant.id, { date: "2026-10-05" })).ok).toBe(true);
    expect(specimens.repotLog.signs.filter((s) => s.specimenId === plant.id)).toEqual([
      {
        userId: "anna",
        specimenId: plant.id,
        sign: "roots_out",
        tickedOn: "2026-09-20",
        clearedOn: "2026-10-05",
      },
      {
        userId: "anna",
        specimenId: plant.id,
        sign: "tips_over",
        tickedOn: "2026-09-21",
        clearedOn: "2026-10-05",
      },
    ]);
  });

  it("US-BES-19: a repot day before the tick clears it on the tick day, never before (the history stays ordered)", async () => {
    const plant = await create("anna", "Bogenhanf", "plant");
    await tick(plant.id, "dries_fast", "2026-10-08");
    expect((await at(plant.id, { date: "2026-10-01" })).ok).toBe(true);
    expect(specimens.repotLog.signs[0]?.clearedOn).toBe("2026-10-08");
  });

  it("US-BES-19: a repot of a cutting records the day and leaves no observation to clear", async () => {
    const cutting = await create("anna", "Bogenhanf", "cutting");
    expect((await at(cutting.id, { date: "2026-09-30" })).ok).toBe(true);
    expect(specimens.repotLog.repots).toEqual([
      { userId: "anna", specimenId: cutting.id, repottedOn: "2026-09-30" },
    ]);
    expect((await specimens.find("anna", cutting.id))?.repottedAt).toBe("2026-09-30");
  });

  it("US-BES-19: a plant's repot day before its catch date is refused like a cutting's, nothing is written", async () => {
    const plant = await create("anna", "Bogenhanf", "plant");
    const before = specimens.writes;
    const r = await at(plant.id, { date: "2026-08-31" });
    expect(!r.ok && r.error.code).toBe("specimen.repotted_before_caught");
    expect(specimens.writes).toBe(before);
    expect(specimens.repotLog.repots).toEqual([]);
  });

  it("US-BES-19: a plant's future day is refused like a cutting's (P-10, nothing written)", async () => {
    const plant = await create("anna", "Bogenhanf", "plant");
    const r = await at(plant.id, { date: "2026-10-11" });
    expect(!r.ok && r.error.code).toBe("specimen.repotted_in_future");
    expect(specimens.repotLog.repots).toEqual([]);
  });
});

describe("US-BES-19 tick and untick a repot observation (DM-BES-09)", () => {
  const sign = (
    specimenId: string,
    op: "tick" | "untick",
    name: "roots_out" | "dries_fast" | "tips_over",
    day = "2026-10-09T10:00:00Z",
  ) => {
    const operation = op === "tick" ? specimenTickRepotSign : specimenUntickRepotSign;
    return execute(
      operation({
        repots: specimens.repotLog,
        keeperOff: async () => false,
        clock: () => new Date(day),
      }),
      { idempotency: idem },
      {
        context: anna,
        input: { specimenId, sign: name, timeZone: "Europe/Berlin" },
        idempotencyKey: `k${++counter}`,
      },
    );
  };

  it("US-BES-19: a tick is open on the local day and is shown with the open observations", async () => {
    const plant = await create("anna", "Bogenhanf", "plant");
    const r = await sign(plant.id, "tick", "roots_out", "2026-10-09T23:30:00Z");
    expect(r.ok && r.value).toEqual({
      specimenId: plant.id,
      signs: [{ sign: "roots_out", tickedOn: "2026-10-10" }],
    });
  });

  it("US-BES-19 / US-QS-03: a tick that is open already writes nothing", async () => {
    const plant = await create("anna", "Bogenhanf", "plant");
    await sign(plant.id, "tick", "tips_over");
    const before = specimens.writes;
    const again = await sign(plant.id, "tick", "tips_over", "2026-10-12T10:00:00Z");
    expect(again.ok && again.value).toEqual({
      specimenId: plant.id,
      signs: [{ sign: "tips_over", tickedOn: "2026-10-09" }],
    });
    expect(specimens.writes).toBe(before);
  });

  it("US-BES-19: an untick clears the open observation and keeps its day; nothing open writes nothing", async () => {
    const plant = await create("anna", "Bogenhanf", "plant");
    await sign(plant.id, "tick", "dries_fast");
    const cleared = await sign(plant.id, "untick", "dries_fast", "2026-10-11T10:00:00Z");
    expect(cleared.ok && cleared.value).toEqual({ specimenId: plant.id, signs: [] });
    expect(specimens.repotLog.signs[0]).toMatchObject({
      tickedOn: "2026-10-09",
      clearedOn: "2026-10-11",
    });
    const before = specimens.writes;
    expect((await sign(plant.id, "untick", "dries_fast")).ok).toBe(true);
    expect(specimens.writes).toBe(before);
  });

  it("US-BES-19: a cutting cannot be ticked, an archived plant cannot either; a foreign plant looks unknown (P-04)", async () => {
    const cutting = await create("anna", "Steckling", "cutting");
    const cut = await sign(cutting.id, "tick", "roots_out");
    expect(!cut.ok && cut.error.code).toBe("specimen.not_a_plant");
    const archived = await create("anna", "Archiv", "plant");
    await specimens.archive("anna", archived.id, "abgegeben", "2026-10-01");
    const arch = await sign(archived.id, "tick", "roots_out");
    expect(!arch.ok && arch.error.code).toBe("specimen.archived");
    const foreign = await create("ben", "Fremd", "plant");
    const other = await sign(foreign.id, "tick", "roots_out");
    expect(!other.ok && other.error.code).toBe("specimen.not_found");
    expect(specimens.repotLog.signs).toEqual([]);
  });

  it("US-BES-19: an unknown observation is refused by the operation, nothing is written (P-03)", async () => {
    const plant = await create("anna", "Bogenhanf", "plant");
    const r = await execute(
      specimenTickRepotSign({
        repots: specimens.repotLog,
        keeperOff: async () => false,
        clock: () => new Date("2026-10-09T10:00:00Z"),
      }),
      { idempotency: idem },
      {
        context: anna,
        input: { specimenId: plant.id, sign: "yellow_leaves", timeZone: "Europe/Berlin" },
        idempotencyKey: `k${++counter}`,
      },
    );
    expect(!r.ok && r.error.details).toEqual([{ field: "sign", code: "input.invalid" }]);
    expect(specimens.repotLog.signs).toEqual([]);
  });
});

describe("US-BES-19 the keeper switch of the repot planner hides and writes nothing (US-ONB-09, P-12)", () => {
  it("US-BES-19: while the switch is off a tick and an untick are refused with onboarding.keeper_off and nothing is written", async () => {
    const plant = await create("anna", "Ausgeschaltet", "plant");
    const off = {
      repots: specimens.repotLog,
      keeperOff: async () => true,
      clock: () => new Date("2026-10-09T10:00:00Z"),
    };
    const tick = await execute(
      specimenTickRepotSign(off),
      { idempotency: idem },
      {
        context: anna,
        input: { specimenId: plant.id, sign: "roots_out", timeZone: "Europe/Berlin" },
        idempotencyKey: `k${++counter}`,
      },
    );
    expect(!tick.ok && tick.error.code).toBe("onboarding.keeper_off");
    const untick = await execute(
      specimenUntickRepotSign(off),
      { idempotency: idem },
      {
        context: anna,
        input: { specimenId: plant.id, sign: "roots_out", timeZone: "Europe/Berlin" },
        idempotencyKey: `k${++counter}`,
      },
    );
    expect(!untick.ok && untick.error.code).toBe("onboarding.keeper_off");
    expect(specimens.repotLog.signs).toEqual([]);
  });
});
