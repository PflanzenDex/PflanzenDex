import { beforeEach, describe, expect, it } from "vitest";
import { execute } from "../../kernel/operation";
import { InMemoryIdempotencyStore } from "../../kernel/test-helpers";
import { treatmentComplete, treatmentReopen } from "../index";
import { SpecimenStub } from "../shared/test-helpers";
import { InMemoryTreatments } from "../treatment-data/treatment-test-helpers";

const E1 = "00000000-0000-4000-8000-000000000001";
const E3 = "00000000-0000-4000-8000-000000000003";
const T1 = "00000000-0000-4000-8000-0000000000a1";
const T2 = "00000000-0000-4000-8000-0000000000a2";
const TB = "00000000-0000-4000-8000-0000000000b1";
const TA = "00000000-0000-4000-8000-0000000000c1";
const anna = { userId: "anna" };
// 2026-10-02 23:30 UTC: already 2026-10-03 in Berlin, still 2026-10-02 in Los Angeles (NFR-08).
const clock = () => new Date("2026-10-02T23:30:00Z");

let treatments: InMemoryTreatments;
let idem: InMemoryIdempotencyStore;
let counter = 0;
let archived: readonly string[] = [];

const stubs = () => new SpecimenStub({ anna: [E1], ben: [E3] }, archived);
const reopen = (input: unknown, context = anna) =>
  execute(
    treatmentReopen({ treatments, specimens: stubs(), clock }),
    { idempotency: idem },
    { context, input, idempotencyKey: `r${++counter}` },
  );
const tick = (id: string, timeZone = "Europe/Berlin") =>
  execute(
    treatmentComplete({ treatments, specimens: stubs(), clock }),
    { idempotency: idem },
    { context: anna, input: { id, timeZone }, idempotencyKey: `c${++counter}` },
  );

beforeEach(() => {
  treatments = new InMemoryTreatments({ anna: [E1], ben: [E3] });
  idem = new InMemoryIdempotencyStore();
  archived = [];
  counter = 0;
  const base = { reason: "Wollläuse", agent: null, courseId: null };
  treatments.rows.push(
    {
      id: T1,
      specimenId: E1,
      dueAt: "2026-10-01",
      done: false,
      doneAt: null,
      userId: "anna",
      ...base,
    },
    {
      id: T2,
      specimenId: E1,
      dueAt: "2026-10-08",
      done: false,
      doneAt: null,
      userId: "anna",
      ...base,
    },
    {
      id: TB,
      specimenId: E3,
      dueAt: "2026-10-01",
      done: false,
      doneAt: null,
      userId: "ben",
      ...base,
    },
    {
      id: TA,
      specimenId: E1,
      dueAt: "2026-09-20",
      done: true,
      doneAt: "2026-09-25",
      userId: "anna",
      ...base,
    },
  );
});

describe("US-QS-32 undo of 'Erledigt' (treatment.reopen)", () => {
  it("US-QS-32 reopens a treatment ticked off today: done and its done date are cleared", async () => {
    await tick(T1);
    const r = await reopen({ id: T1, timeZone: "Europe/Berlin" });
    expect(r).toMatchObject({
      ok: true,
      value: { treatment: { id: T1, done: false, doneAt: null } },
    });
    expect(treatments.rows.find((t) => t.id === T1)).toMatchObject({ done: false, doneAt: null });
  });

  it("US-QS-32 'today' is the local date in the given time zone (NFR-08): done on the 3rd in Berlin, reopened in Berlin", async () => {
    await tick(T1, "Europe/Berlin");
    const la = await reopen({ id: T1, timeZone: "America/Los_Angeles" });
    expect(la.ok === false && la.error.code).toBe("treatment.not_reopenable");
    const berlin = await reopen({ id: T1, timeZone: "Europe/Berlin" });
    expect(berlin).toMatchObject({ ok: true, value: { treatment: { done: false } } });
  });

  it("US-QS-32 a treatment ticked off on an earlier day is not reopened: refused with its own code, nothing changes", async () => {
    const r = await reopen({ id: TA, timeZone: "Europe/Berlin" });
    expect(r.ok === false && r.error.code).toBe("treatment.not_reopenable");
    expect(treatments.rows.find((t) => t.id === TA)).toMatchObject({
      done: true,
      doneAt: "2026-09-25",
    });
  });

  it("US-QS-32 an open treatment stays open and answers with its row (idempotent, no error)", async () => {
    const r = await reopen({ id: T2, timeZone: "Europe/Berlin" });
    expect(r).toMatchObject({ ok: true, value: { treatment: { id: T2, done: false } } });
    expect(treatments.writes).toBe(0);
  });

  it("US-QS-32 a repeat after the reopen answers ok and changes nothing", async () => {
    await tick(T1);
    await reopen({ id: T1, timeZone: "Europe/Berlin" });
    const again = await reopen({ id: T1, timeZone: "Europe/Berlin" });
    expect(again).toMatchObject({ ok: true, value: { treatment: { done: false } } });
  });

  it("US-QS-32 an unknown id is treatment.not_found and nothing is written", async () => {
    const r = await reopen({
      id: "00000000-0000-4000-8000-0000000000ff",
      timeZone: "Europe/Berlin",
    });
    expect(r.ok === false && r.error.code).toBe("treatment.not_found");
    expect(treatments.writes).toBe(0);
  });

  it("US-QS-32 a foreign treatment looks unknown, the other account's row is untouched (P-04)", async () => {
    await execute(
      treatmentComplete({ treatments, specimens: stubs(), clock }),
      { idempotency: idem },
      {
        context: { userId: "ben" },
        input: { id: TB, timeZone: "Europe/Berlin" },
        idempotencyKey: "ben-complete",
      },
    );
    const r = await reopen({ id: TB, timeZone: "Europe/Berlin" });
    expect(r.ok === false && r.error.code).toBe("treatment.not_found");
    expect(treatments.rows.find((t) => t.id === TB)).toMatchObject({ done: true });
  });

  it("US-QS-32 a treatment of an archived specimen is refused as archived and nothing is written", async () => {
    await tick(T1);
    archived = [E1];
    const r = await reopen({ id: T1, timeZone: "Europe/Berlin" });
    expect(r.ok === false && r.error.code).toBe("specimen.archived");
    expect(treatments.rows.find((t) => t.id === T1)).toMatchObject({ done: true });
  });

  it.each([
    ["no id", { timeZone: "Europe/Berlin" }, "id"],
    ["no time zone", { id: T1 }, "timeZone"],
  ])("US-QS-32 invalid input (%s) writes nothing", async (_, input, field) => {
    const r = await reopen(input);
    expect(r.ok === false && r.error.code).toBe("input.invalid");
    expect(r.ok === false && r.error.details?.map((d) => d.field)).toEqual([field]);
    expect(treatments.writes).toBe(0);
  });
});

describe("US-QS-32 the reopen says whether it changed the treatment and is atomic in the store", () => {
  it("US-QS-32 an open treatment answers changed false, a reopened one changed true", async () => {
    await tick(T1);
    expect(await reopen({ id: T1, timeZone: "Europe/Berlin" })).toMatchObject({
      ok: true,
      value: { changed: true, treatment: { done: false } },
    });
    expect(await reopen({ id: T2, timeZone: "Europe/Berlin" })).toMatchObject({
      ok: true,
      value: { changed: false, treatment: { done: false } },
    });
  });

  it("US-QS-32 the store reopens only a row whose done date is the expected one; another day is not reopenable", async () => {
    await tick(T1);
    expect(await treatments.reopen("anna", T1, "2026-10-02")).toBe("not_reopenable");
    expect(treatments.rows.find((t) => t.id === T1)).toMatchObject({ done: true });
    expect(await treatments.reopen("anna", T1, "2026-10-03")).toMatchObject({ done: false });
  });
});
