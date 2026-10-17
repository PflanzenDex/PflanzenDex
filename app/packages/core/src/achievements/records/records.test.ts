import { describe, expect, it } from "vitest";
import { growthMoments, RECORD_LIMITS, type RecordPoint } from "../index";

const p = (
  id: string,
  date: string,
  value: number,
  quality: "healthy" | "etiolated" = "healthy",
): RecordPoint => ({
  id,
  date,
  value,
  quality,
});
/** Stand-in for the trend of the care module (the module `achievements` imports nothing from it). */
const flat = () => null;

describe("US-ACH-05 growth moments and personal records", () => {
  it("US-ACH-05 fewer than 2 measurements: unknown, not a record (P-08)", () => {
    expect(growthMoments([], flat).latest).toEqual({ kind: "unknown" });
    expect(growthMoments([p("a", "2026-01-01", 10)], flat).latest).toEqual({ kind: "unknown" });
  });

  it("US-ACH-05 a span below 90 days: unknown, so a short interval cannot make an extreme yearly rate", () => {
    expect(RECORD_LIMITS.minSpanDays).toBe(90);
    const r = growthMoments([p("a", "2026-01-01", 10), p("b", "2026-03-31", 30)], flat);
    expect(r.latest).toEqual({ kind: "unknown" });
    expect(r.records).toEqual([]);
  });

  it("US-ACH-05 healthy, 90 days or more: N cm since the first measurement", () => {
    const r = growthMoments([p("a", "2026-01-01", 10), p("b", "2026-04-01", 14)], flat);
    expect(r.latest).toMatchObject({
      kind: "moment",
      since: "2026-01-01",
      growth: 4,
      record: null,
    });
  });

  it("US-ACH-05 an etiolated last measurement shows nothing, whatever the growth (US-WAC-04)", () => {
    const r = growthMoments(
      [p("a", "2026-01-01", 10), p("b", "2026-06-01", 40, "etiolated")],
      flat,
    );
    expect(r.latest).toEqual({ kind: "none" });
    expect(r.records).toEqual([]);
  });

  it("US-ACH-05 a slower trend shows nothing", () => {
    const r = growthMoments([p("a", "2026-01-01", 10), p("b", "2026-06-01", 20)], () => "slower");
    expect(r.latest).toEqual({ kind: "none" });
  });

  it("US-ACH-05 no growth (equal or smaller value) is no success", () => {
    const r = growthMoments([p("a", "2026-01-01", 10), p("b", "2026-06-01", 10)], flat);
    expect(r.latest).toEqual({ kind: "none" });
  });

  it("US-ACH-05 a yearly rate above the own earlier best is a new personal record", () => {
    const list = [
      p("a", "2025-01-01", 10),
      p("b", "2025-07-01", 16), // rate since the first: 12.1 cm/year
      p("c", "2026-01-01", 40), // rate since the first: 30 cm/year, beats 12.1
    ];
    const r = growthMoments(list, flat);
    expect(r.latest).toMatchObject({ kind: "moment", growth: 30 });
    expect(r.latest.kind === "moment" && r.latest.record?.ratePerYear).toBeCloseTo(30, 0);
    expect(r.records).toEqual(["c"]);
  });

  it("US-ACH-05 the first usable rate has no earlier best: a growth moment but no record", () => {
    const r = growthMoments([p("a", "2025-01-01", 10), p("b", "2025-07-01", 16)], flat);
    expect(r.latest).toMatchObject({ kind: "moment", record: null });
    expect(r.records).toEqual([]);
  });

  it("US-ACH-05 an equal or lower rate is no record; an etiolated earlier rate is not the best to beat", () => {
    const list = [
      p("a", "2025-01-01", 10),
      p("b", "2025-07-01", 40, "etiolated"),
      p("c", "2026-01-01", 20),
    ];
    const r = growthMoments(list, flat);
    expect(r.latest).toMatchObject({ kind: "moment", record: null });
  });

  it("US-ACH-05 order does not matter and only the own history counts", () => {
    const shuffled = [p("c", "2026-01-01", 40), p("a", "2025-01-01", 10), p("b", "2025-07-01", 16)];
    expect(growthMoments(shuffled, flat).records).toEqual(["c"]);
  });
});
