// US-LIC-03: position recommendation based on light demand.
import { describe, it, expect } from "vitest";
import {
  POSITION_THRESHOLD_DEFAULTS,
  positionThresholdsOrDefault,
  recommendPosition,
} from "./position-recommendation";

const category = (lux: number) => recommendPosition(lux)?.category;

describe("US-LIC-03: position recommendation", () => {
  it.each([
    [200_000, "directly_under_lamp"],
    [50_000, "directly_under_lamp"],
    [49_999, "very_close"],
    [15_000, "very_close"],
    [14_999, "close"],
    [8_000, "close"],
    [7_999, "medium_distance"],
    [4_000, "medium_distance"],
    [3_999, "further_away"],
    [1, "further_away"],
    [0, "further_away"],
  ])("maps %i lux to %s", (lux, expected) => {
    expect(category(lux)).toBe(expected);
  });

  it("returns the German description for the UI", () => {
    expect(recommendPosition(20_000)?.description).toBe("sehr nah (~10 cm)");
    expect(recommendPosition(60_000)?.description).toBe("direkt unter der Lampe");
  });

  it.each([Number.NaN, -1, -50_000, Number.POSITIVE_INFINITY])(
    "gives no recommendation for the invalid demand %s (P-08, nothing is invented)",
    (lux) => {
      expect(recommendPosition(lux)).toBeNull();
    },
  );
});

describe("US-LIC-03: adjustable thresholds (FR-LIC-05)", () => {
  const own = [100_000, 30_000, 10_000, 2_000] as const;

  it.each([
    [60_000, "very_close"],
    [100_000, "directly_under_lamp"],
    [9_999, "medium_distance"],
    [1_999, "further_away"],
  ])("maps %i lux with the keeper's thresholds to %s", (lux, expected) => {
    expect(recommendPosition(lux, own)?.category).toBe(expected);
  });

  it("uses the standard values without thresholds", () => {
    expect(recommendPosition(50_000)?.category).toBe("directly_under_lamp");
  });

  it("falls back to the standard values for a stored value that is unusable (P-08)", () => {
    expect(positionThresholdsOrDefault(null)).toEqual(POSITION_THRESHOLD_DEFAULTS);
    expect(positionThresholdsOrDefault([1, 2, 3, 4])).toEqual(POSITION_THRESHOLD_DEFAULTS);
    expect(positionThresholdsOrDefault(own)).toEqual(own);
  });
});
