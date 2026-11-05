import { describe, expect, it } from "vitest";
import {
  budgetOf,
  exitCode,
  readLimits,
  report,
  type Measurement,
  type PerfLimits,
} from "./budget-report";

const LIMITS: PerfLimits = {
  size: 1000,
  blocking: false,
  default: { maxMedianMs: 50, maxP95Ms: 100, maxBodyKb: 100 },
  routes: { "/today": { maxMedianMs: 80 } },
};

const row = (pattern: string, over: Partial<Measurement["rows"][number]> = {}) => ({
  size: 1000,
  screen: "",
  pattern,
  status: 200,
  bytes: 10 * 1024,
  median: 10,
  p95: 20,
  sql: { total: 5, payload: 3 },
  ...over,
});

const data = (rows: Measurement["rows"]): Measurement => ({
  date: "2026-11-05T00:00:00Z",
  cpu: "test",
  cores: 4,
  runs: 20,
  skipped: [{ pattern: "/friends/:id/shared", reason: "needs a friend" }],
  rows,
});

describe("NFR-12 nightly load measurement against the budgets (issue 1250)", () => {
  it("NFR-12 a route's own budget overrides the default", () => {
    expect(budgetOf(LIMITS, "/today")).toEqual({ maxMedianMs: 80, maxP95Ms: 100, maxBodyKb: 100 });
    expect(budgetOf(LIMITS, "/specimens")).toEqual(LIMITS.default);
  });

  it("NFR-12 a route past its budget is listed, but report only does not fail the run", () => {
    const r = report(
      data([
        row("/today", { median: 90 }),
        row("/specimens", { bytes: 200 * 1024 }),
        row("/species"),
      ]),
      LIMITS,
    );
    expect(r.over).toEqual(["/today: median 90.0 > 80 ms", "/specimens: body 200.0 > 100 KB"]);
    expect(r.broken).toEqual([]);
    expect(r.markdown).toContain("report only");
    expect(r.markdown).toContain("Over budget: 2 of 3 routes");
    expect(r.markdown).toContain("Not measured: `/friends/:id/shared` (needs a friend)");
    expect(exitCode(r, LIMITS)).toBe(0);
  });

  it("NFR-12 with blocking on, a route past its budget fails the run", () => {
    const blocking = { ...LIMITS, blocking: true };
    expect(exitCode(report(data([row("/today", { p95: 101 })]), blocking), blocking)).toBe(1);
    expect(exitCode(report(data([row("/today")]), blocking), blocking)).toBe(0);
  });

  it("NFR-12 P-10 a broken measurement always fails: a route that is not 200, or no rows at the budget size", () => {
    const failed = report(data([row("/today", { status: 500 })]), LIMITS);
    expect(failed.broken).toEqual(["/today answered 500"]);
    expect(exitCode(failed, LIMITS)).toBe(1);
    const empty = report(data([row("/today", { size: 100 })]), LIMITS);
    expect(empty.broken).toEqual(["no rows at 1000 specimens"]);
    expect(exitCode(empty, LIMITS)).toBe(1);
  });

  it("NFR-12 the budgets in quality-limits.json are complete and report only", () => {
    const limits = readLimits();
    expect(limits.blocking).toBe(false);
    for (const value of Object.values(limits.default)) expect(value).toBeGreaterThan(0);
    for (const budget of Object.values(limits.routes ?? {}))
      for (const value of Object.values(budget)) expect(value).toBeGreaterThan(0);
  });
});
