import { describe, expect, it } from "vitest";
import { measurementView } from "../../index";
import { SpecimenStub, InMemoryMeasurements, speciesStub } from "../../shared/test-helpers";

const E1 = "00000000-0000-4000-8000-000000000001";

const view = async (rows: readonly [string, number][]) => {
  const measurements = new InMemoryMeasurements({ anna: [E1] });
  for (const [date, value] of rows)
    await measurements.create("anna", {
      specimenId: E1,
      date,
      value,
      quality: "healthy",
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
    expect((await view([]))?.growth).toEqual({ count: 0, ratePerYear: null, trend: null });
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
