import { describe, expect, it } from "vitest";
import { growthTrend } from "./growth";

const m = (date: string, value: number) => ({ date, value });

describe("US-WAC-03 growth rate and trend against the own average", () => {
  it("zero measurements: no rate, no trend", () => {
    expect(growthTrend([])).toEqual({ count: 0, ratePerYear: null, trend: null, signal: null });
  });

  it("one measurement: no rate yet", () => {
    expect(growthTrend([m("2026-01-01", 10)])).toEqual({
      count: 1,
      ratePerYear: null,
      trend: null,
      signal: null,
    });
  });

  it("two measurements: overall rate in cm/year = (delta value / delta days) x 365, no trend yet", () => {
    const r = growthTrend([m("2026-01-01", 10), m("2026-01-11", 11)]);
    expect(r.count).toBe(2);
    expect(r.ratePerYear).toBeCloseTo(36.5, 10);
    expect(r.trend).toBeNull();
  });

  it("the rate runs between the first and the last measurement and can be negative", () => {
    const r = growthTrend([m("2026-01-01", 10), m("2026-02-01", 14), m("2026-01-11", 9)]);
    expect(r.ratePerYear).toBeCloseTo(((14 - 10) / 31) * 365, 10);
    expect(growthTrend([m("2026-01-01", 10), m("2026-01-11", 9)]).ratePerYear).toBeCloseTo(
      -36.5,
      10,
    );
  });

  it("sorts by date before evaluating (newest-first input gives the same result)", () => {
    const asc = [m("2026-01-01", 10), m("2026-01-11", 11), m("2026-01-21", 13)];
    expect(growthTrend([...asc].reverse())).toEqual(growthTrend(asc));
  });

  it("three measurements: last interval rate more than 10 % above the mean of the previous ones is faster", () => {
    // intervals of 10 days: 1 cm (0.1/day), then 1.2 cm (0.12/day): +20 %
    expect(
      growthTrend([m("2026-01-01", 10), m("2026-01-11", 11), m("2026-01-21", 12.2)]).trend,
    ).toBe("faster");
  });

  it("more than 10 % below the mean is slower", () => {
    expect(
      growthTrend([m("2026-01-01", 10), m("2026-01-11", 12), m("2026-01-21", 12.8)]).trend,
    ).toBe("slower");
  });

  it("within +-10 % is stable", () => {
    expect(
      growthTrend([m("2026-01-01", 10), m("2026-01-11", 11), m("2026-01-21", 12.05)]).trend,
    ).toBe("stable");
    expect(
      growthTrend([m("2026-01-01", 10), m("2026-01-11", 11), m("2026-01-21", 11.95)]).trend,
    ).toBe("stable");
  });

  it("uses the mean of ALL previous interval rates, not only the one before", () => {
    // rates/day: 0.2, 0.0, 0.11 -> mean of previous 0.1 -> +10 % is stable
    const r = growthTrend([
      m("2026-01-01", 10),
      m("2026-01-11", 12),
      m("2026-01-21", 12),
      m("2026-01-31", 13.1),
    ]);
    expect(r.trend).toBe("stable");
    const faster = growthTrend([
      m("2026-01-01", 10),
      m("2026-01-11", 12),
      m("2026-01-21", 12),
      m("2026-01-31", 13.2),
    ]);
    expect(faster.trend).toBe("faster");
  });

  it("a mean of 0 counts as stable", () => {
    expect(growthTrend([m("2026-01-01", 10), m("2026-01-11", 10), m("2026-01-21", 15)]).trend).toBe(
      "stable",
    );
  });

  it("two measurements on the same day give no rate", () => {
    const r = growthTrend([m("2026-01-01", 10), m("2026-01-01", 12)]);
    expect(r).toEqual({ count: 2, ratePerYear: null, trend: null, signal: null });
  });

  it("an interval of zero days is skipped and never divides by zero", () => {
    const r = growthTrend([m("2026-01-01", 10), m("2026-01-01", 11), m("2026-01-11", 12)]);
    expect(r.ratePerYear).toBeCloseTo(73, 10);
    expect(r.trend).toBeNull();
    expect(Number.isFinite(r.ratePerYear)).toBe(true);
  });

  it("does not compare with a species average (P-08): the result has no such field", () => {
    expect(Object.keys(growthTrend([m("2026-01-01", 1), m("2026-02-01", 2)])).sort()).toEqual([
      "count",
      "ratePerYear",
      "signal",
      "trend",
    ]);
  });
});

const q = (date: string, value: number, quality: "healthy" | "etiolated") => ({
  date,
  value,
  quality,
});
// intervals of 10 days: 1 cm, then 1.2 cm: trend faster
const FASTER = [q("2026-01-01", 10, "healthy"), q("2026-01-11", 11, "healthy")] as const;

describe("US-WAC-04 etiolation overrides the trend", () => {
  it("last measurement etiolated: signal etiolated, regardless of the rate (rate stays visible)", () => {
    const r = growthTrend([...FASTER, q("2026-01-21", 12.2, "etiolated")]);
    expect(r.signal).toBe("etiolated");
    expect(r.trend).toBe("faster");
    expect(r.ratePerYear).toBeCloseTo((2.2 / 20) * 365, 10);
  });

  it("etiolated with falling rate or without a trend is still etiolated", () => {
    expect(
      growthTrend([q("2026-01-01", 10, "healthy"), q("2026-01-11", 9, "etiolated")]).signal,
    ).toBe("etiolated");
    expect(growthTrend([q("2026-01-01", 10, "etiolated")]).signal).toBe("etiolated");
  });

  it("a rising trend is a success signal only together with a healthy last measurement", () => {
    expect(growthTrend([...FASTER, q("2026-01-21", 12.2, "healthy")]).signal).toBe("success");
  });

  it("an earlier etiolated measurement does not override a healthy last one", () => {
    const r = growthTrend([
      q("2026-01-01", 10, "etiolated"),
      q("2026-01-11", 11, "healthy"),
      q("2026-01-21", 12.2, "healthy"),
    ]);
    expect(r.signal).toBe("success");
  });

  it("the last measurement is the latest by date, however the rows are ordered", () => {
    const r = growthTrend([q("2026-01-21", 12.2, "etiolated"), ...FASTER].reverse());
    expect(r.signal).toBe("etiolated");
  });

  it("no rising trend and healthy: no success signal; missing quality counts as healthy", () => {
    expect(growthTrend([...FASTER, q("2026-01-21", 12.05, "healthy")]).signal).toBeNull();
    expect(
      growthTrend([
        { date: "2026-01-01", value: 1 },
        { date: "2026-01-11", value: 2 },
      ]).signal,
    ).toBeNull();
  });

  it("no measurement: no signal", () => {
    expect(growthTrend([]).signal).toBeNull();
  });
});
