import { describe, expect, it } from "vitest";
import { execute } from "../../kernel/operation";
import { InMemoryIdempotencyStore } from "../../kernel/test-helpers";
import {
  achievementsAddRhythmPause,
  achievementsRemoveRhythmPause,
  careRhythm,
  restPauses,
  type RhythmPauseStore,
  type StoredRhythmPause,
} from "../index";

let seq = 0;

class InMemoryPauses implements RhythmPauseStore {
  readonly rows = new Map<string, StoredRhythmPause[]>();
  async listPauses(userId: string) {
    return this.rows.get(userId) ?? [];
  }
  async addPause(userId: string, pause: { from: string; until: string }) {
    const row = { id: `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`, ...pause };
    this.rows.set(userId, [...(this.rows.get(userId) ?? []), row]);
    return row;
  }
  async removePause(userId: string, id: string) {
    const rows = this.rows.get(userId) ?? [];
    this.rows.set(
      userId,
      rows.filter((r) => r.id !== id),
    );
    return rows.some((r) => r.id === id);
  }
}

const setup = () => {
  const pauses = new InMemoryPauses();
  const idempotency = new InMemoryIdempotencyStore();
  let n = 0;
  const run = (op: ReturnType<typeof achievementsAddRhythmPause>, userId: string, input: unknown) =>
    execute(op, { idempotency }, { context: { userId }, input, idempotencyKey: `k${++n}` });
  return {
    pauses,
    add: (userId: string, input: unknown) =>
      run(achievementsAddRhythmPause({ pauses }), userId, input),
    remove: (userId: string, input: unknown) =>
      execute(
        achievementsRemoveRhythmPause({ pauses }),
        { idempotency },
        { context: { userId }, input, idempotencyKey: `k${++n}` },
      ),
  };
};

describe("US-ACH-04 explicit pause", () => {
  it("US-ACH-04 stores a pause of up to 4 weeks (28 days, both ends included)", async () => {
    const { pauses, add } = setup();
    expect(await add("anna", { from: "2026-07-01", until: "2026-07-28" })).toMatchObject({
      ok: true,
    });
    expect(await pauses.listPauses("anna")).toHaveLength(1);
  });

  it("US-ACH-04 refuses a pause longer than 4 weeks with a stable code and writes nothing", async () => {
    const { pauses, add } = setup();
    expect(await add("anna", { from: "2026-07-01", until: "2026-07-29" })).toMatchObject({
      ok: false,
      error: { code: "achievements.pause_too_long" },
    });
    expect(await pauses.listPauses("anna")).toEqual([]);
  });

  it("US-ACH-04 refuses a pause that ends before it starts and invalid dates", async () => {
    const { pauses, add } = setup();
    for (const bad of [
      { from: "2026-07-10", until: "2026-07-01" },
      { from: "2026-02-30", until: "2026-03-02" },
      { from: "2026-07-01" },
      null,
    ]) {
      expect(await add("anna", bad)).toMatchObject({ ok: false, error: { code: "input.invalid" } });
    }
    expect(pauses.rows.size).toBe(0);
  });

  it("US-ACH-04 removes only an own pause; a foreign or unknown one is not found", async () => {
    const { pauses, add, remove } = setup();
    const made = await add("anna", { from: "2026-07-01", until: "2026-07-07" });
    const id = made.ok ? made.value.id : "";
    expect(await remove("ben", { id })).toMatchObject({ ok: false });
    // The in-memory fake is keyed by account, like the row rule of the database (P-04).
    expect(await pauses.listPauses("anna")).toHaveLength(1);
    expect(await remove("anna", { id })).toMatchObject({ ok: true });
    expect(await remove("anna", { id })).toMatchObject({
      ok: false,
      error: { code: "achievements.pause_not_found" },
    });
  });

  it("US-ACH-04 a pause makes the open task inside it neutral and names no loss", () => {
    const tasks = [{ dueOn: "2026-09-22", doneOn: null }];
    expect(careRhythm(tasks, "2026-10-14").openTasks).toBe(1);
    const paused = careRhythm(tasks, "2026-10-14", [{ from: "2026-09-21", until: "2026-09-27" }]);
    expect(paused.openTasks).toBe(0);
    expect(paused.weeks.every((w) => w.state === "none")).toBe(true);
  });
});

describe("US-ACH-04 rest of all specimens", () => {
  const winter = { from: "11-01", until: "03-15" };

  it("US-ACH-04 derives a pause for the days on which every plant is dormant, across the turn of the year", () => {
    expect(restPauses([winter, winter], "2026-12-30", "2027-01-02")).toEqual([
      { from: "2026-12-30", until: "2027-01-02" },
    ]);
  });

  it("US-ACH-04 splits at the end of the dormancy and joins consecutive days", () => {
    expect(restPauses([winter], "2027-03-14", "2027-03-17")).toEqual([
      { from: "2027-03-14", until: "2027-03-15" },
    ]);
  });

  it("US-ACH-04 one plant in growth phase keeps the days counted", () => {
    const summer = { from: "06-01", until: "08-31" };
    expect(restPauses([winter, summer], "2026-12-01", "2026-12-31")).toEqual([]);
  });

  it("US-ACH-04 a plant without dormancy period, or no plant at all, never rests (P-08)", () => {
    expect(restPauses([winter, null], "2026-12-01", "2026-12-10")).toEqual([]);
    expect(restPauses([], "2026-12-01", "2026-12-10")).toEqual([]);
  });

  it("US-ACH-04 a week of rest is neutral: it neither extends nor breaks the run", () => {
    const tasks = [
      { dueOn: "2026-12-01", doneOn: "2026-12-01" },
      { dueOn: "2026-12-08", doneOn: null },
      { dueOn: "2026-12-15", doneOn: "2026-12-15" },
    ];
    const rest = restPauses([winter], "2026-12-07", "2026-12-13");
    const r = careRhythm(tasks, "2026-12-16", rest);
    expect(r.currentRun).toBe(2);
    expect(r.openTasks).toBe(0);
  });
});
