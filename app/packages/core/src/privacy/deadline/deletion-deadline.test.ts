import { describe, expect, it } from "vitest";
import { classifyDeadlines, deadlineHealth, deadlineOf, deadlineState } from "./deletion-deadline";

const at = (iso: string) => new Date(iso);

describe("US-ACC-04 the deadline of a deletion request is one calendar month (GDPR Art. 12(3))", () => {
  it("US-ACC-04 is one calendar month later at the same UTC time of day", () => {
    expect(deadlineOf(at("2026-10-01T10:00:00.000Z")).toISOString()).toBe(
      "2026-11-01T10:00:00.000Z",
    );
  });

  it("US-ACC-04 a shorter month ends on its last day: 31 January is due on 28 February, 29 February in a leap year", () => {
    expect(deadlineOf(at("2026-01-31T08:30:00.000Z")).toISOString()).toBe(
      "2026-02-28T08:30:00.000Z",
    );
    expect(deadlineOf(at("2028-01-31T08:30:00.000Z")).toISOString()).toBe(
      "2028-02-29T08:30:00.000Z",
    );
  });

  it("US-ACC-04 rolls over the year, and 31 March is due on 30 April", () => {
    expect(deadlineOf(at("2026-12-31T23:00:00.000Z")).toISOString()).toBe(
      "2027-01-31T23:00:00.000Z",
    );
    expect(deadlineOf(at("2026-03-31T12:00:00.000Z")).toISOString()).toBe(
      "2026-04-30T12:00:00.000Z",
    );
  });
});

describe("US-ACC-04 the warning window of 7 days and the passed deadline", () => {
  const deadline = at("2026-11-01T10:00:00.000Z");

  it("US-ACC-04 is open before the window, near inside its last 7 days, and past from the deadline on", () => {
    expect(deadlineState(deadline, at("2026-10-24T10:00:00.000Z"))).toBe("open");
    expect(deadlineState(deadline, at("2026-10-25T09:59:59.999Z"))).toBe("open");
    expect(deadlineState(deadline, at("2026-10-25T10:00:00.000Z"))).toBe("near");
    expect(deadlineState(deadline, at("2026-10-31T23:00:00.000Z"))).toBe("near");
    expect(deadlineState(deadline, at("2026-11-01T10:00:00.000Z"))).toBe("past");
    expect(deadlineState(deadline, at("2026-12-01T00:00:00.000Z"))).toBe("past");
  });

  it("US-ACC-04 lists the near and passed items apart, earliest deadline first, and ignores done items", () => {
    const now = at("2026-10-30T00:00:00.000Z");
    const report = classifyDeadlines(
      [
        { id: "later", requestedAt: at("2026-10-05T00:00:00.000Z"), done: false },
        { id: "done", requestedAt: at("2026-09-01T00:00:00.000Z"), done: true },
        { id: "passed", requestedAt: at("2026-09-20T00:00:00.000Z"), done: false },
        { id: "open", requestedAt: at("2026-10-20T00:00:00.000Z"), done: false },
        { id: "soon", requestedAt: at("2026-10-01T00:00:00.000Z"), done: false },
      ],
      now,
    );
    expect(report.near.map((item) => item.id)).toEqual(["soon", "later"]);
    expect(report.past.map((item) => item.id)).toEqual(["passed"]);
    expect(report.near[0]?.deadline.toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });

  it("US-ACC-04 the health is deadline_passed when one passed, near when one is near, ok otherwise", () => {
    expect(deadlineHealth({ near: [], past: [] })).toBe("ok");
    expect(deadlineHealth({ near: [{}], past: [] })).toBe("near");
    expect(deadlineHealth({ near: [{}], past: [{}] })).toBe("deadline_passed");
  });
});
