import { describe, expect, it } from "vitest";
import { groupByLocation } from "./group-by-location";

const plant = (location: string | null, lightZone: string | null) => ({ location, lightZone });

describe("US-QS-14 plants grouped by location", () => {
  it("US-QS-14 groups by location, alphabetically, with the zone and the count in the heading", () => {
    const groups = groupByLocation([
      plant("Wohnzimmer", "Zone 2"),
      plant("Flur", "Zone 3"),
      plant("Wohnzimmer", "Zone 2"),
    ]);
    expect(groups.map((g) => g.title)).toEqual([
      "Flur · Zone 3 · 1 Pflanze",
      "Wohnzimmer · Zone 2 · 2 Pflanzen",
    ]);
  });

  it("US-QS-14 plants without a known location come last and are named, not hidden (P-08, P-10)", () => {
    const groups = groupByLocation([plant(null, null), plant("Flur", null)]);
    expect(groups.map((g) => g.title)).toEqual([
      "Flur · Zone unbekannt · 1 Pflanze",
      "Standort unbekannt · Zone unbekannt · 1 Pflanze",
    ]);
    expect(groups.map((g) => g.key)).toEqual(["Flur", "unknown"]);
  });

  it("US-QS-14 no plants give no groups", () => {
    expect(groupByLocation([])).toEqual([]);
  });
});
