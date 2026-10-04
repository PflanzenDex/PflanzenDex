import { beforeEach, describe, expect, it } from "vitest";
import { execute } from "../kernel/operation";
import { InMemoryIdempotencyStore } from "../kernel/test-helpers";
import { treatmentComplete, treatmentHistory, treatmentSource } from "./index";
import { SpecimenStub } from "./test-helpers";
import { InMemoryTreatments } from "./treatment-test-helpers";

const E1 = "00000000-0000-4000-8000-000000000001";
const E2 = "00000000-0000-4000-8000-000000000002";
const E3 = "00000000-0000-4000-8000-000000000003";
const T1 = "00000000-0000-4000-8000-0000000000a1";
const T2 = "00000000-0000-4000-8000-0000000000a2";
const T3 = "00000000-0000-4000-8000-0000000000a3";
const TB = "00000000-0000-4000-8000-0000000000b1";
const anna = { userId: "anna" };
// 2026-10-02 23:30 UTC: already 2026-10-03 in Berlin, still 2026-10-02 in Los Angeles (NFR-08).
const clock = () => new Date("2026-10-02T23:30:00Z");

let treatments: InMemoryTreatments;
let idem: InMemoryIdempotencyStore;
let counter = 0;
const stubs = (archived: readonly string[] = []) =>
  new SpecimenStub({ anna: [E1, E2], ben: [E3] }, archived);

const complete = (input: unknown, context = anna, archived: readonly string[] = []) =>
  execute(
    treatmentComplete({ treatments, specimens: stubs(archived), clock }),
    { idempotency: idem },
    { context, input, idempotencyKey: `k${++counter}` },
  );
const tick = (id = T1, timeZone = "Europe/Berlin") => complete({ id, timeZone });

function seed() {
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
      id: T3,
      specimenId: E2,
      dueAt: "2026-10-05",
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
  );
}

beforeEach(() => {
  treatments = new InMemoryTreatments({ anna: [E1, E2], ben: [E3] });
  idem = new InMemoryIdempotencyStore();
  seed();
});

describe("US-BEH-03 tick off a date", () => {
  it("US-BEH-03 sets done and stores the local calendar date, addressed by the id", async () => {
    const r = await tick(T2);
    expect(r).toMatchObject({
      ok: true,
      value: { treatment: { id: T2, done: true, doneAt: "2026-10-03" } },
    });
    expect(treatments.rows.find((t) => t.id === T1)).toMatchObject({ done: false, doneAt: null });
    expect(treatments.rows.find((t) => t.id === T2)).toMatchObject({ done: true });
  });

  it("US-BEH-03 the done date is the date in the user's time zone, not the UTC date (NFR-08)", async () => {
    const berlin = await tick(T1, "Europe/Berlin");
    const la = await tick(T2, "America/Los_Angeles");
    expect(berlin).toMatchObject({ value: { treatment: { doneAt: "2026-10-03" } } });
    expect(la).toMatchObject({ value: { treatment: { doneAt: "2026-10-02" } } });
  });

  it("US-BEH-03 a second tap changes nothing: the first done date stays, no error (idempotent)", async () => {
    const first = await tick(T1, "America/Los_Angeles");
    const again = await tick(T1, "Europe/Berlin");
    expect(again).toMatchObject({ ok: true, value: { treatment: { doneAt: "2026-10-02" } } });
    expect(again).toEqual(first);
    expect(treatments.rows.find((t) => t.id === T1)?.doneAt).toBe("2026-10-02");
  });

  it.each([
    ["no id", { timeZone: "Europe/Berlin" }, "id"],
    ["id not an id", { id: "3", timeZone: "Europe/Berlin" }, "id"],
    ["no time zone", { id: T1 }, "timeZone"],
    ["unknown time zone", { id: T1, timeZone: "Mars/Olympus" }, "timeZone"],
  ])("US-BEH-03 invalid input (%s) writes nothing", async (_, input, field) => {
    const r = await complete(input);
    expect(r.ok === false && r.error.code).toBe("input.invalid");
    expect(r.ok === false && r.error.details?.map((d) => d.field)).toEqual([field]);
    expect(treatments.writes).toBe(0);
  });

  it("US-BEH-03 an unknown id is treatment.not_found and nothing is written", async () => {
    const r = await tick("00000000-0000-4000-8000-0000000000ff");
    expect(r).toMatchObject({ ok: false, error: { code: "treatment.not_found" } });
    expect(treatments.writes).toBe(0);
  });

  it("US-BEH-03 a treatment of another account looks unknown and stays open (P-04)", async () => {
    const r = await tick(TB);
    expect(r).toMatchObject({ ok: false, error: { code: "treatment.not_found" } });
    expect(treatments.rows.find((t) => t.id === TB)).toMatchObject({ done: false });
    expect(treatments.writes).toBe(0);
  });

  it("US-BEH-03 a treatment of an archived specimen is refused: specimen.archived, stays open", async () => {
    const r = await complete({ id: T3, timeZone: "Europe/Berlin" }, anna, [E2]);
    expect(r).toMatchObject({ ok: false, error: { code: "specimen.archived" } });
    expect(treatments.rows.find((t) => t.id === T3)).toMatchObject({ done: false });
    expect(treatments.writes).toBe(0);
  });
});

describe("US-BEH-03 the open list and the card follow", () => {
  const rows = (id: string): Promise<readonly string[]> =>
    treatmentSource({ treatments })
      .open("anna", [E1, E2])
      .then((open) => (open.get(id) ?? []).map((t) => t.id));

  it("US-BEH-03 a done treatment leaves the open treatments; the next date of the specimen is the new first one (US-BES-06)", async () => {
    await tick(T1);
    expect(await rows(E1)).toEqual([T2]);
    expect(await rows(E2)).toEqual([T3]);
  });

  it("US-BEH-03 when the last open treatment is done the specimen has none left", async () => {
    await tick(T3);
    expect((await treatmentSource({ treatments }).open("anna", [E2])).size).toBe(0);
  });
});

describe("US-BEH-03 history per specimen", () => {
  const history = (specimenId: unknown, userId = "anna", archived: readonly string[] = []) =>
    treatmentHistory({ treatments, specimens: stubs(archived) }, userId, specimenId);

  it("US-BEH-03 done entries stay as history of the specimen, latest first, open ones are not in it", async () => {
    await tick(T2, "America/Los_Angeles");
    await tick(T1, "Europe/Berlin");
    const r = await history(E1);
    expect(r.ok && r.value.map((t) => [t.id, t.doneAt])).toEqual([
      [T1, "2026-10-03"],
      [T2, "2026-10-02"],
    ]);
  });

  it("US-BEH-03 a specimen without done treatments has an empty history", async () => {
    expect(await history(E2)).toEqual({ ok: true, value: [] });
  });

  it("US-BEH-03 the history of an archived specimen stays readable", async () => {
    await tick(T3);
    const r = await history(E2, "anna", [E2]);
    expect(r.ok && r.value.map((t) => t.id)).toEqual([T3]);
  });

  it("US-BEH-03 a foreign or unknown specimen is specimen.not_found, an invalid id input.invalid (P-04)", async () => {
    expect(await history(E3)).toMatchObject({ ok: false, error: { code: "specimen.not_found" } });
    expect(await history("x")).toMatchObject({ ok: false, error: { code: "input.invalid" } });
  });
});
