import { describe, expect, it } from "vitest";
import { effectiveDormancy, effectiveProfile, type CareProfile } from "./index";

const CATALOG = { dormancyFrom: "11-01", dormancyUntil: "03-15" };
const NONE = { dormancyFrom: null, dormancyUntil: null };
const profile = (extra: Partial<CareProfile> = {}): CareProfile => ({
  speciesId: "s1",
  growthLocationId: null,
  dormancyLocationId: null,
  lightZoneId: null,
  dormancyFrom: null,
  dormancyUntil: null,
  wateringGrowthDays: null,
  wateringDormancyDays: null,
  ownHints: null,
  ...extra,
});

describe("US-BES-09 effective care profile (FR-BES-09: specimen before profile before catalog)", () => {
  it("US-BES-09 without a profile the catalog applies and unknown stays unknown (P-08)", () => {
    const e = effectiveProfile({ species: CATALOG, profile: null, catalogZoneId: "z3" });
    expect(e.dormancy).toEqual({
      catalog: { from: "11-01", until: "03-15" },
      own: null,
      effective: { from: "11-01", until: "03-15" },
      source: "catalog",
    });
    expect(e.lightZone).toEqual({ catalog: "z3", own: null, effective: "z3", source: "catalog" });
    expect(e.growthLocation).toEqual({
      catalog: null,
      own: null,
      effective: null,
      source: "unknown",
    });
    expect(e.wateringGrowthDays.source).toBe("unknown");
    expect(e.ownHints.source).toBe("unknown");
  });

  it("US-BES-09 an empty care profile is valid and equals no profile", () => {
    const empty = effectiveProfile({ species: CATALOG, profile: profile(), catalogZoneId: "z3" });
    expect(empty).toEqual(
      effectiveProfile({ species: CATALOG, profile: null, catalogZoneId: "z3" }),
    );
  });

  it("US-BES-09 the care profile takes precedence over the catalog and shows both side by side", () => {
    const e = effectiveProfile({
      species: CATALOG,
      profile: profile({
        lightZoneId: "z2",
        dormancyFrom: "10-01",
        dormancyUntil: "02-01",
        growthLocationId: "l1",
        wateringGrowthDays: 7,
        ownHints: "Trocken",
      }),
      catalogZoneId: "z3",
    });
    expect(e.lightZone).toEqual({ catalog: "z3", own: "z2", effective: "z2", source: "profile" });
    expect(e.dormancy).toEqual({
      catalog: { from: "11-01", until: "03-15" },
      own: { from: "10-01", until: "02-01" },
      effective: { from: "10-01", until: "02-01" },
      source: "profile",
    });
    expect(e.growthLocation).toMatchObject({ own: "l1", effective: "l1", source: "profile" });
    expect(e.wateringGrowthDays).toMatchObject({ own: 7, effective: 7, source: "profile" });
    expect(e.ownHints).toMatchObject({ own: "Trocken", source: "profile" });
  });

  it("US-BES-09 the specimen takes precedence over the care profile and the catalog", () => {
    const e = effectiveProfile({
      species: CATALOG,
      profile: profile({ lightZoneId: "z2", growthLocationId: "l1" }),
      specimen: { lightZoneId: "z4" },
      catalogZoneId: "z3",
    });
    expect(e.lightZone).toEqual({ catalog: "z3", own: "z2", effective: "z4", source: "specimen" });
    expect(e.growthLocation.source).toBe("profile");
  });

  it("US-BES-09 a species without dormancy period can get one from the care profile", () => {
    expect(effectiveDormancy(NONE, null)).toBeNull();
    expect(
      effectiveDormancy(NONE, profile({ dormancyFrom: "06-01", dormancyUntil: "08-31" })),
    ).toEqual({
      from: "06-01",
      until: "08-31",
    });
  });

  it("US-BES-09 effectiveDormancy: override beats catalog, reset (null) falls back to the catalog", () => {
    expect(
      effectiveDormancy(CATALOG, profile({ dormancyFrom: "10-01", dormancyUntil: "02-01" })),
    ).toEqual({
      from: "10-01",
      until: "02-01",
    });
    expect(effectiveDormancy(CATALOG, profile())).toEqual({ from: "11-01", until: "03-15" });
  });
});
