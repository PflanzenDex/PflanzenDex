import { describe, expect, it } from "vitest";
import { measurementView } from "../../index";
import { SpecimenStub, InMemoryMeasurements, speciesStub } from "../../shared/test-helpers";

const E1 = "00000000-0000-4000-8000-000000000001";

const view = async (rows: readonly [string, number, ("healthy" | "etiolated")?][]) => {
  const measurements = new InMemoryMeasurements({ anna: [E1] });
  for (const [date, value, quality] of rows)
    await measurements.create("anna", {
      specimenId: E1,
      date,
      value,
      quality: quality ?? "healthy",
      note: null,
      ratedBy: "keeper",
    });
  return measurementView(
    { measurements, specimens: new SpecimenStub({ anna: [E1] }), species: speciesStub("height") },
    "anna",
    E1,
  );
};

describe("US-WAC-03 growth rate and trend in the Measure view", () => {
  it("without measurement: count 0, no rate, no trend", async () => {
    expect((await view([]))?.growth).toEqual({
      count: 0,
      ratePerYear: null,
      trend: null,
      signal: null,
    });
  });

  it("derives rate and trend from the specimen's own measurements, however they were back-filled", async () => {
    const v = await view([
      ["2026-01-21", 12.2],
      ["2026-01-01", 10],
      ["2026-01-11", 11],
    ]);
    expect(v?.growth.count).toBe(3);
    expect(v?.growth.ratePerYear).toBeCloseTo((2.2 / 20) * 365, 10);
    expect(v?.growth.trend).toBe("faster");
  });
});

describe("US-WAC-04 etiolation overrides the trend in the Measure view", () => {
  it("a rising trend with an etiolated last measurement is no success signal", async () => {
    const rows: [string, number, ("healthy" | "etiolated")?][] = [
      ["2026-01-01", 10],
      ["2026-01-11", 11],
      ["2026-01-21", 12.2, "etiolated"],
    ];
    expect((await view(rows))?.growth.signal).toBe("etiolated");
    expect((await view([...rows.slice(0, 2), ["2026-01-21", 12.2]]))?.growth.signal).toBe(
      "success",
    );
  });
});
