import { describe, expect, it } from "vitest";
import { GAP_MAX, PROMOTE_FROM } from "../derive";
import { classificationRules } from "./rules";

describe("US-LIC-04 look up the classification rules", () => {
  it("Given the reference, then the indicators for higher levels name CAM + arid origin, full sun, thick cuticle and spines", () => {
    const text = classificationRules()
      .indicators.map((i) => i.text)
      .join(" ");
    for (const term of ["CAM", "arid", "Vollsonne", "Kutikula", "Dornen"]) {
      expect(text).toContain(term);
    }
  });

  it("Given the reference, then it lists warning signs, each with a hint what to do next (P-09)", () => {
    const { warnings } = classificationRules();
    expect(warnings.length).toBeGreaterThan(0);
    for (const w of warnings) {
      expect(w.sign).not.toBe("");
      expect(w.action).not.toBe("");
    }
  });

  it("the promotion thresholds shown come from the derivation constants, not from a copy", () => {
    const { thresholds } = classificationRules();
    expect(thresholds.promoteFromPercent).toBe(
      (PROMOTE_FROM.counter * 100) / PROMOTE_FROM.denominator,
    );
    expect(thresholds.stayBelowGapPercent).toBe(
      100 - (GAP_MAX.counter * 100) / GAP_MAX.denominator,
    );
  });

  it("every indicator and warning has a unique stable key", () => {
    const r = classificationRules();
    const keys = [...r.indicators.map((i) => i.key), ...r.warnings.map((w) => w.key)];
    expect(new Set(keys).size).toBe(keys.length);
  });
});
