import { describe, expect, it } from "vitest";
import { achievementsRhythm } from "./rhythm";

// US-ACH-04: the care rhythm from treatments and measurement intervals (fakes, no database).
const spec = (
  id: string,
  caughtAt: string | null,
  over: { status?: string; archivedAt?: string | null } = {},
) => ({ id, name: id, speciesId: "s", caughtAt, archivedAt: null, status: "plant", ...over });
const treatment = (dueAt: string, doneAt: string | null) => ({
  dueAt,
  done: doneAt !== null,
  doneAt,
});
type Spec = ReturnType<typeof spec>;
function deps(
  rows: Spec[],
  opt: {
    open?: Record<string, ReturnType<typeof treatment>[]>;
    done?: Record<string, ReturnType<typeof treatment>[]>;
    dates?: Record<string, string[]>;
    days?: number;
    users?: string[];
    pauses?: { id: string; from: string; until: string }[];
    dormancy?: { dormancyFrom: string | null; dormancyUntil: string | null };
  } = {},
) {
  return {
    specimens: {
      list: async (u: string) => {
        opt.users?.push(u);
        return rows;
      },
    },
    treatments: {
      open: async () => new Map(Object.entries(opt.open ?? {})),
      done: async (_u: string, id: string) => opt.done?.[id] ?? [],
    },
    measurements: {
      list: async (_u: string, id: string) =>
        (opt.dates?.[id] ?? []).map((date) => ({ date })).reverse(),
    },
    pauses: { listPauses: async () => opt.pauses ?? [] },
    species: {
      findMany: async (_u: string, ids: string[]) =>
        ids.map(() => opt.dormancy ?? { dormancyFrom: null, dormancyUntil: null }),
    },
    profiles: { list: async () => [] },
    reminders: { settings: async () => ({ measurementDays: opt.days ?? 30 }) },
  } as unknown as Parameters<typeof achievementsRhythm>[0];
}
// Wednesday 2026-10-14, 12:00 UTC.
const NOW = new Date("2026-10-14T12:00:00Z");
const run = (d: ReturnType<typeof deps>) => achievementsRhythm(d, "anna", "Europe/Berlin", NOW);

describe("US-ACH-04 care rhythm through the API logic", () => {
  it("US-ACH-04 treatment dates done on time build the run; an open one is named as open, not as a loss", async () => {
    const r = await run(
      deps([spec("a", null, { status: "cutting" })], {
        done: { a: [treatment("2026-09-29", "2026-09-29"), treatment("2026-10-06", "2026-10-07")] },
        open: { a: [treatment("2026-09-22", null)] },
      }),
    );
    expect(r.calmMode).toBe(false);
    expect(r.currentRun).toBe(2);
    expect(r.longestRun).toBe(2);
    expect(r.openTasks).toBe(1);
  });

  it("US-ACH-04 a measurement is due 'measurementDays' after the last one; measuring earlier counts the same", async () => {
    const early = await run(
      deps([spec("p", "2026-08-01")], { dates: { p: ["2026-08-20", "2026-09-30"] }, days: 30 }),
    );
    // Tasks: due 08-31 done 08-20 (early, on time), due 09-19 done 09-30 (late), due 10-30 not yet due.
    expect(early.hasTasks).toBe(true);
    expect(early.openTasks).toBe(0);
    const weekStates = early.weeks.map((w) => w.state);
    expect(weekStates).toContain("open");
    expect(weekStates).toContain("on_time");
  });

  it("US-ACH-04 a plant never measured is overdue after the interval since the catch date, once", async () => {
    const r = await run(deps([spec("p", "2026-08-01")], { days: 30 }));
    expect(r.openTasks).toBe(1);
    expect(r.currentRun).toBe(0);
  });

  it("US-ACH-04 a cutting is left out of the measurement tasks (E-11)", async () => {
    const r = await run(deps([spec("c", "2026-01-01", { status: "cutting" })], { days: 30 }));
    expect(r.hasTasks).toBe(false);
  });

  it("US-ACH-04 tasks still open when a specimen was archived are dropped (the archive ends the need)", async () => {
    const r = await run(
      deps([spec("a", "2026-01-01", { archivedAt: "2026-02-01" })], {
        open: { a: [treatment("2026-03-01", null)] },
        dates: { a: ["2026-01-15"] },
      }),
    );
    expect(r.openTasks).toBe(0);
  });

  it("US-ACH-04 reads only the own account (P-04) and shows unknown when nothing was ever due", async () => {
    const users: string[] = [];
    const r = await run(deps([], { users }));
    expect(users).toEqual(["anna"]);
    expect(r).toMatchObject({ hasTasks: false, currentRun: 0, longestRun: 0 });
  });

  it("US-ACH-04 an explicit pause makes its weeks neutral: the open task inside it is not counted", async () => {
    const tasks = { open: { a: [treatment("2026-09-22", null)] } };
    const plain = await run(deps([spec("a", null, { status: "cutting" })], tasks));
    expect(plain.openTasks).toBe(1);
    const paused = await run(
      deps([spec("a", null, { status: "cutting" })], {
        ...tasks,
        pauses: [{ id: "p1", from: "2026-09-20", until: "2026-09-26" }],
      }),
    );
    expect(paused.openTasks).toBe(0);
    expect(paused.hasTasks).toBe(false);
    expect(paused.pauses).toEqual([{ id: "p1", from: "2026-09-20", until: "2026-09-26" }]);
  });

  it("US-ACH-04 weeks in which every plant is dormant are neutral, one plant in growth keeps them counted", async () => {
    const rows = [spec("p", "2026-08-01")];
    const base = { open: { p: [treatment("2026-09-22", null)] }, dates: { p: ["2026-08-05"] } };
    const growth = await run(deps(rows, base));
    expect(growth.openTasks).toBeGreaterThan(0);
    const dormant = await run(
      deps(rows, { ...base, dormancy: { dormancyFrom: "09-01", dormancyUntil: "10-31" } }),
    );
    expect(dormant.openTasks).toBe(0);
  });

  it("US-ACH-04 a plant whose species has no dormancy period is never at rest (P-08)", async () => {
    const r = await run(
      deps([spec("p", "2026-08-01")], { open: { p: [treatment("2026-09-22", null)] } }),
    );
    expect(r.openTasks).toBeGreaterThan(0);
  });
});
