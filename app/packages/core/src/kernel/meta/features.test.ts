import { describe, expect, it } from "vitest";
import {
  ALL_FEATURES,
  NO_FEATURES,
  featureEnabled,
  featureStates,
  featuresFromEnv,
  knownFeatures,
} from "./features";

describe("US-DEV-06 feature switches", () => {
  it("US-DEV-06 production without FEATURES: everything off", () => {
    expect(featuresFromEnv({ NODE_ENV: "production" })).toEqual(NO_FEATURES);
    expect(featuresFromEnv({ NODE_ENV: "production", FEATURES: "  " })).toEqual(NO_FEATURES);
  });

  it("US-DEV-06 development and tests without FEATURES: everything on", () => {
    expect(featuresFromEnv({})).toEqual(ALL_FEATURES);
    expect(featuresFromEnv({ NODE_ENV: "test" })).toEqual(ALL_FEATURES);
  });

  it("US-DEV-06 a list switches exactly the named functions on", () => {
    expect([...featuresFromEnv({ NODE_ENV: "production", FEATURES: "social, ai" })]).toEqual([
      "social",
      "ai",
    ]);
  });

  it("US-DEV-06 an unknown name stops the start", () => {
    expect(() => featuresFromEnv({ FEATURES: "social,ki" })).toThrow(/ki/);
  });

  it("US-DEV-06 on for the account only when the global or the account switch is on", () => {
    const social = knownFeatures(["social"]);
    expect(featureEnabled("social", NO_FEATURES, NO_FEATURES)).toBe(false);
    expect(featureEnabled("social", social, NO_FEATURES)).toBe(true);
    expect(featureEnabled("social", NO_FEATURES, social)).toBe(true);
    expect(featureEnabled("ai", NO_FEATURES, social)).toBe(false);
    expect(featureStates(NO_FEATURES, knownFeatures(["ai", "unknown"]))).toEqual({
      social: false,
      ai: true,
      recommendations: false,
    });
  });
});
