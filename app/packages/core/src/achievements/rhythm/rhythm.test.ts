import { describe, expect, it } from "vitest";
import { careRhythm, RHYTHM_LIMITS, type RhythmTask } from "../index";

// 2026-10-14 is a Wednesday; weeks run Monday to Sunday: 2026-10-05, 2026-10-12, ...
const TODAY = "2026-10-14";
const task = (dueOn: string, doneOn: string | null): RhythmTask => ({ dueOn, doneOn });

describe("US-ACH-04 care rhythm instead of a streak", () => {
  it("US-ACH-04 a week counts as on time when every task due in it was done by its due date plus the grace day", () => {
    const r = careRhythm(
      [task("2026-10-06", "2026-10-07"), task("2026-10-08", "2026-10-08")],
      TODAY,
    );
    expect(r.weeks.find((w) => w.start === "2026-10-05")?.state).toBe("on_time");
    expect(RHYTHM_LIMITS.graceDays).toBe(1);
    const late = careRhythm([task("2026-10-06", "2026-10-08")], TODAY);
    expect(late.weeks.find((w) => w.start === "2026-10-05")?.state).toBe("open");
  });

  it("US-ACH-04 weeks without a due task are neutral: they neither extend nor break the rhythm", () => {
    const r = careRhythm(
      [task("2026-09-15", "2026-09-15"), task("2026-10-06", "2026-10-06")],
      TODAY,
    );
    expect(r.currentRun).toBe(2);
    expect(r.weeks.find((w) => w.start === "2026-09-21")?.state).toBe("none");
  });

  it("US-ACH-04 a missed week restarts the current run, the longest run stays and the text counts open tasks", () => {
    const r = careRhythm(
      [
        task("2026-08-04", "2026-08-04"),
        task("2026-08-11", "2026-08-11"),
        task("2026-08-18", "2026-08-18"),
        task("2026-08-25", null),
        task("2026-09-08", "2026-09-08"),
      ],
      TODAY,
    );
    expect(r.longestRun).toBe(3);
    expect(r.currentRun).toBe(1);
    expect(r.openTasks).toBe(1);
  });

  it("US-ACH-04 a task not yet due or still within the grace day does not break the run", () => {
    const r = careRhythm(
      [task("2026-10-06", "2026-10-06"), task("2026-10-13", null), task("2026-10-16", null)],
      TODAY,
    );
    expect(r.currentRun).toBe(1);
    expect(r.weeks.at(-1)?.state).toBe("pending");
    // The task due on 13 October is open (nothing is lost), the one due on 16 October is not due yet.
    expect(r.openTasks).toBe(1);
  });

  it("US-ACH-04 shows the last 12 weeks, the current week last", () => {
    const r = careRhythm([task("2026-10-06", "2026-10-06")], TODAY);
    expect(r.weeks).toHaveLength(RHYTHM_LIMITS.weeks);
    expect(r.weeks.at(-1)?.start).toBe("2026-10-12");
    expect(r.weeks[0]?.start).toBe("2026-07-27");
  });

  it("US-ACH-04 without any task there is no rhythm: all weeks neutral, nothing invented (P-08)", () => {
    const r = careRhythm([], TODAY);
    expect(r).toMatchObject({ currentRun: 0, longestRun: 0, openTasks: 0, hasTasks: false });
    expect(r.weeks.every((w) => w.state === "none")).toBe(true);
  });

  it("US-ACH-04 doing a task earlier than due earns nothing more (FR-ACH-05)", () => {
    const early = careRhythm([task("2026-10-08", "2026-10-01")], TODAY);
    const exact = careRhythm([task("2026-10-08", "2026-10-08")], TODAY);
    expect(early.currentRun).toBe(exact.currentRun);
    expect(early.currentRun).toBe(1);
  });

  it("US-ACH-04 the weeks of a pause are neutral and open tasks inside it do not count", () => {
    const tasks = [
      task("2026-09-01", "2026-09-01"),
      task("2026-09-15", null),
      task("2026-10-06", "2026-10-06"),
    ];
    const withoutPause = careRhythm(tasks, TODAY);
    expect(withoutPause.currentRun).toBe(1);
    const paused = careRhythm(tasks, TODAY, [{ from: "2026-09-14", until: "2026-09-27" }]);
    expect(paused.currentRun).toBe(2);
    expect(paused.openTasks).toBe(0);
    expect(paused.weeks.find((w) => w.start === "2026-09-14")?.state).toBe("none");
  });

  it("US-ACH-04 tasks later than today are ignored", () => {
    const r = careRhythm([task("2026-11-01", null)], TODAY);
    expect(r.hasTasks).toBe(false);
  });
});
