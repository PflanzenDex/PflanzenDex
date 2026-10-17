import { describe, expect, it } from "vitest";
import { yearInReview, type YearInput, type YearMeasurement } from "../index";

const m = (over: Partial<YearMeasurement> & { id: string; date: string }): YearMeasurement => ({
  specimenId: "a",
  value: 10,
  quality: "healthy",
  hasPhoto: false,
  ...over,
});
const base: YearInput = {
  year: 2025,
  specimens: [
    { id: "a", name: "Alma", caughtOn: "2025-03-01", cuttingRootedOn: null },
    { id: "b", name: "Bert", caughtOn: "2024-12-31", cuttingRootedOn: "2025-06-01" },
    { id: "c", name: "Cleo", caughtOn: null, cuttingRootedOn: null },
  ],
  measurements: [],
  treatmentCourses: [],
  handoverDates: [],
  earned: [],
};

describe("US-ACH-07 year in review", () => {
  it("US-ACH-07 counts only events dated in the year, from the keeper's data", () => {
    const r = yearInReview({
      ...base,
      measurements: [m({ id: "1", date: "2025-01-02" }), m({ id: "2", date: "2026-01-01" })],
      treatmentCourses: [
        { doneOn: ["2025-05-01", "2025-05-08"] },
        { doneOn: ["2025-05-01", null] },
        { doneOn: ["2024-12-30", "2025-01-06"] },
        { doneOn: ["2024-11-01"] },
      ],
      handoverDates: ["2025-08-01", "2024-08-01"],
      earned: [
        { id: "cutting-rooted", earnedOn: "2025-06-01" },
        { id: "first-handover", earnedOn: null },
      ],
    });
    expect(r.counts).toEqual({
      speciesCaught: 1,
      cuttingsRooted: 1,
      treatmentsCompleted: 2,
      measurements: 1,
      handovers: 1,
      achievementsEarned: 1,
    });
    expect(r.hasData).toBe(true);
  });

  it("US-ACH-07 a year without data says so and shows unknown instead of zero growth", () => {
    const r = yearInReview({ ...base, year: 2020 });
    expect(r.hasData).toBe(false);
    expect(r.growth).toBeNull();
    expect(r.photos).toBeNull();
  });

  it("US-ACH-07 the largest healthy growth uses the own rate; etiolated, short spans and no growth are unknown", () => {
    const r = yearInReview({
      ...base,
      measurements: [
        m({ id: "1", date: "2025-01-01", value: 10 }),
        m({ id: "2", date: "2025-07-01", value: 14 }),
        // etiolated growth never counts (US-WAC-04)
        m({ id: "3", date: "2025-01-01", specimenId: "b", value: 5 }),
        m({ id: "4", date: "2025-12-01", specimenId: "b", value: 50, quality: "etiolated" }),
        // span below the limit
        m({ id: "5", date: "2025-01-01", specimenId: "c", value: 1 }),
        m({ id: "6", date: "2025-02-01", specimenId: "c", value: 9 }),
      ],
    });
    expect(r.growth?.specimenId).toBe("a");
    expect(r.growth?.growth).toBe(4);
    expect(r.growth?.ratePerYear).toBeCloseTo((4 / 181) * 365, 5);
    const none = yearInReview({ ...base, measurements: [m({ id: "1", date: "2025-01-01" })] });
    expect(none.growth).toBeNull();
  });

  it("US-ACH-07 the photo pair is the first and last photo of the year of one specimen", () => {
    const r = yearInReview({
      ...base,
      measurements: [
        m({ id: "1", date: "2025-09-01", hasPhoto: true }),
        m({ id: "2", date: "2025-02-01", hasPhoto: true }),
        m({ id: "3", date: "2025-05-01", hasPhoto: true }),
        m({ id: "4", date: "2024-05-01", hasPhoto: true }),
        m({ id: "5", date: "2025-04-01", specimenId: "b", hasPhoto: true }),
      ],
    });
    expect(r.photos).toMatchObject({
      specimenId: "a",
      first: { measurementId: "2", date: "2025-02-01" },
      last: { measurementId: "1", date: "2025-09-01" },
    });
    expect(
      yearInReview({ ...base, measurements: [m({ id: "1", date: "2025-02-01", hasPhoto: true })] })
        .photos,
    ).toBeNull();
  });

  it("US-ACH-07 the result holds counted facts only: no percentage, rating or rank (FR-ACH-04)", () => {
    const keys = Object.keys(yearInReview(base)).sort();
    expect(keys).toEqual(["counts", "growth", "hasData", "photos", "year"]);
  });
});
