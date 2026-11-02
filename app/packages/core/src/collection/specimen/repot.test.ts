import { beforeEach, describe, expect, it } from "vitest";
import { execute } from "../../kernel";
import { InMemoryIdempotencyStore } from "../../kernel/test-helpers";
import { specimenRepot } from "../index";
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

  it("US-BES-04: a plant is not a cutting, the status stays and nothing is written", async () => {
    const plant = await create("anna", "Bogenhanf", "plant");
    const before = specimens.writes;
    const r = await repot(plant.id);
    expect(!r.ok && r.error.code).toBe("specimen.not_a_cutting");
    expect(specimens.writes).toBe(before);
  });

  it("US-BES-04: an archived cutting is not repotted", async () => {
    const cutting = await create("anna", "Bogenhanf", "cutting");
    await specimens.archive("anna", cutting.id, "abgegeben", "2026-10-01");
    const r = await repot(cutting.id);
    expect(!r.ok && r.error.code).toBe("specimen.not_a_cutting");
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
