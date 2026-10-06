import { beforeEach, describe, expect, it } from "vitest";
import { execute } from "../../kernel/operation";
import { InMemoryIdempotencyStore } from "../../kernel/test-helpers";
import { treatmentPlan, treatmentSource } from "../index";
import { SpecimenStub } from "../shared/test-helpers";
import { InMemoryTreatments } from "../treatment-data/treatment-test-helpers";
import { addDays } from "../treatment-data/treatment-dates";

const E1 = "00000000-0000-4000-8000-000000000001";
const E2 = "00000000-0000-4000-8000-000000000002";
const E3 = "00000000-0000-4000-8000-000000000003";
const anna = { userId: "anna" };

let treatments: InMemoryTreatments;
let idem: InMemoryIdempotencyStore;
let counter = 0;
let courses = 0;

const plan = (
  input: unknown,
  context = anna,
  key = `k${++counter}`,
  archived: readonly string[] = [],
) =>
  execute(
    treatmentPlan({
      treatments,
      specimens: new SpecimenStub({ anna: [E1, E2], ben: [E3] }, archived),
      newId: () => `course-${++courses}`,
    }),
    { idempotency: idem },
    { context, input, idempotencyKey: key },
  );
const input = (extra: Record<string, unknown> = {}) => ({
  specimenIds: [E1],
  reason: "Wollläuse",
  date: "2026-10-10",
  ...extra,
});

beforeEach(() => {
  treatments = new InMemoryTreatments({ anna: [E1, E2], ben: [E3] });
  idem = new InMemoryIdempotencyStore();
  courses = 0;
});

describe("US-BEH-01 Behandlungstermine planen: single treatment", () => {
  it("US-BEH-01 stores reason, agent and date for the specimen as an open treatment without a course", async () => {
    const r = await plan(input({ agent: "  Neemöl " }));
    expect(r).toMatchObject({
      ok: true,
      value: {
        treatments: [
          {
            specimenId: E1,
            reason: "Wollläuse",
            agent: "Neemöl",
            dueAt: "2026-10-10",
            done: false,
            doneAt: null,
            courseId: null,
          },
        ],
      },
    });
    expect(treatments.rows).toHaveLength(1);
  });

  it("US-BEH-01 the agent is optional: without it the treatment has none (P-08)", async () => {
    expect(await plan(input())).toMatchObject({
      ok: true,
      value: { treatments: [{ agent: null }] },
    });
  });

  it("US-BEH-01 several specimens get one treatment each, with the same reason and date", async () => {
    const r = await plan(input({ specimenIds: [E1, E2] }));
    expect(r).toMatchObject({ ok: true });
    expect(treatments.rows.map((t) => [t.specimenId, t.dueAt])).toEqual([
      [E1, "2026-10-10"],
      [E2, "2026-10-10"],
    ]);
  });

  it.each([
    ["reason missing", { reason: undefined }, "reason"],
    ["reason blank", { reason: "   " }, "reason"],
    ["date missing", { date: undefined }, "date"],
    ["date not real", { date: "2026-02-30" }, "date"],
    ["date as text", { date: "morgen" }, "date"],
    ["no specimen", { specimenIds: [] }, "specimenIds"],
    ["agent blank", { agent: "  " }, "agent"],
  ])("US-BEH-01 without reason or date nothing is saved (%s)", async (_, extra, field) => {
    const r = await plan(input(extra));
    expect(r).toMatchObject({ ok: false, error: { code: "input.invalid" } });
    expect(r.ok === false && r.error.details?.map((d) => d.field)).toEqual([field]);
    expect(treatments.writes).toBe(0);
  });
});

describe("US-BEH-01 Kur planen", () => {
  it("US-BEH-01 N dates at an interval of T days create N individual treatments sharing one course id", async () => {
    const r = await plan(input({ count: 4, intervalDays: 5, agent: "Spiritus" }));
    expect(r).toMatchObject({ ok: true });
    expect(treatments.rows.map((t) => t.dueAt)).toEqual([
      "2026-10-10",
      "2026-10-15",
      "2026-10-20",
      "2026-10-25",
    ]);
    expect(new Set(treatments.rows.map((t) => t.courseId))).toEqual(new Set(["course-1"]));
    expect(treatments.rows.every((t) => t.reason === "Wollläuse" && t.agent === "Spiritus")).toBe(
      true,
    );
  });

  it("US-BEH-01 only one of count and interval given: the default 3 dates, 7 days fills the other", async () => {
    await plan(input({ count: 2 }));
    expect(treatments.rows.map((t) => t.dueAt)).toEqual(["2026-10-10", "2026-10-17"]);
    treatments.rows.length = 0;
    await plan(input({ intervalDays: 7 }));
    expect(treatments.rows.map((t) => t.dueAt)).toEqual(["2026-10-10", "2026-10-17", "2026-10-24"]);
  });

  it("US-BEH-01 a course for several specimens: each specimen gets its own course id and N dates", async () => {
    await plan(input({ specimenIds: [E1, E2], count: 2, intervalDays: 3 }));
    expect(treatments.rows.map((t) => [t.specimenId, t.dueAt, t.courseId])).toEqual([
      [E1, "2026-10-10", "course-1"],
      [E1, "2026-10-13", "course-1"],
      [E2, "2026-10-10", "course-2"],
      [E2, "2026-10-13", "course-2"],
    ]);
  });

  it("US-BEH-01 the dates cross month and year ends and leap days by calendar, not by time", () => {
    expect(addDays("2026-12-30", 7)).toBe("2027-01-06");
    expect(addDays("2028-02-27", 3)).toBe("2028-03-01");
    expect(addDays("2026-10-25", 7)).toBe("2026-11-01");
  });

  it.each([
    ["count 0", { count: 0 }, "count"],
    ["count too high", { count: 21 }, "count"],
    ["count not whole", { count: 2.5 }, "count"],
    ["interval 0", { intervalDays: 0 }, "intervalDays"],
    ["interval too high", { intervalDays: 366 }, "intervalDays"],
  ])("US-BEH-01 rejects an invalid course (%s) and writes nothing", async (_, extra, field) => {
    const r = await plan(input(extra));
    expect(r.ok === false && r.error.details?.map((d) => d.field)).toEqual([field]);
    expect(treatments.writes).toBe(0);
  });
});

describe("US-BEH-01 specimens and tenant isolation", () => {
  it("US-BEH-01 a foreign or unknown specimen looks the same: specimen.not_found, nothing written (P-04)", async () => {
    for (const id of [E3, "00000000-0000-4000-8000-0000000000ff"]) {
      const r = await plan(input({ specimenIds: [E1, id] }));
      expect(r).toMatchObject({ ok: false, error: { code: "specimen.not_found" } });
    }
    expect(treatments.writes).toBe(0);
  });

  it("US-BEH-01 an archived specimen is refused for the whole call (FR-BEH-04, US-BES-07)", async () => {
    const r = await plan(input({ specimenIds: [E1, E2] }), anna, "k-archived", [E2]);
    expect(r).toMatchObject({ ok: false, error: { code: "specimen.archived" } });
    expect(treatments.writes).toBe(0);
  });

  it("US-BEH-01 the same Idempotency-Key writes only once, a changed input under it conflicts", async () => {
    const first = await plan(input({ count: 2 }), anna, "same");
    const again = await plan(input({ count: 2 }), anna, "same");
    expect(again).toEqual(first);
    expect(treatments.rows).toHaveLength(2);
    expect(await plan(input({ count: 3 }), anna, "same")).toMatchObject({
      ok: false,
      error: { code: "idempotency.key_conflict" },
    });
  });
});

describe("US-BEH-01 port TreatmentSource for the specimen cards (US-BES-06)", () => {
  it("US-BEH-01 open treatments of the own specimens reach the card as reason and due date", async () => {
    await plan(input({ specimenIds: [E1, E2], count: 2, intervalDays: 3 }));
    await plan(input({ specimenIds: [E3], reason: "fremd" }), { userId: "ben" });
    const source = treatmentSource({ treatments });
    const open = await source.open("anna", [E1]);
    expect([...open.keys()]).toEqual([E1]);
    expect(open.get(E1)?.map((t) => [t.reason, t.dueAt])).toEqual([
      ["Wollläuse", "2026-10-10"],
      ["Wollläuse", "2026-10-13"],
    ]);
  });

  it("US-BEH-01 the source never answers for foreign specimens and not for an empty list (P-04)", async () => {
    await plan(input({ specimenIds: [E3] }), { userId: "ben" });
    const source = treatmentSource({ treatments });
    expect((await source.open("anna", [E3])).size).toBe(0);
    expect((await source.open("anna", [])).size).toBe(0);
  });
});
