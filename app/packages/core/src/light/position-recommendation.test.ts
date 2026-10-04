// US-LIC-03: position recommendation based on light demand.
import { describe, it, expect } from "vitest";
import { recommendPosition } from "./position-recommendation";

describe("US-LIC-03: position recommendation", () => {
  it("recommends 'directly under lamp' for demand >= 50000 lux", () => {
    const r = recommendPosition(50_000);
    expect(r.category).toBe("directly_under_lamp");
  });

  it("recommends 'very close' for demand >= 15000 lux", () => {
    const r = recommendPosition(15_000);
    expect(r.category).toBe("very_close");
  });

  it("recommends 'very close' for demand >= 15000 but < 50000", () => {
    const r = recommendPosition(20_000);
    expect(r.category).toBe("very_close");
  });

  it("recommends 'close' for demand >= 8000 lux", () => {
    const r = recommendPosition(8_000);
    expect(r.category).toBe("close");
  });

  it("recommends 'close' for demand >= 8000 but < 15000", () => {
    const r = recommendPosition(10_000);
    expect(r.category).toBe("close");
  });

  it("recommends 'medium distance' for demand >= 4000 lux", () => {
    const r = recommendPosition(4_000);
    expect(r.category).toBe("medium_distance");
  });

  it("recommends 'medium distance' for demand >= 4000 but < 8000", () => {
    const r = recommendPosition(6_000);
    expect(r.category).toBe("medium_distance");
  });

  it("recommends 'further away' for demand < 4000 lux", () => {
    const r = recommendPosition(3_000);
    expect(r.category).toBe("further_away");
  });

  it("recommends 'further away' for demand 0", () => {
    const r = recommendPosition(0);
    expect(r.category).toBe("further_away");
  });

  it("returns German description for UI display", () => {
    const r = recommendPosition(20_000);
    expect(r.description).toBe("sehr nah (~10 cm)");
  });
});
