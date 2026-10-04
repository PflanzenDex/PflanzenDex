// US-LIC-03: position recommendation based on light demand.
import { describe, it, expect } from "vitest";
import { recommendPosition } from "./position-recommendation";

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
