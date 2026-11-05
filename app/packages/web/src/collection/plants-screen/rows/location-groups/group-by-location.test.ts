import { describe, expect, it } from "vitest";
import { groupTitle, locationChoices, UNKNOWN_PLACE, UNPLACED_KEY } from "./group-by-location";

describe("US-QS-14 plants grouped by location", () => {
  it("US-QS-14 the heading names the place, its zone and the full number of plants", () => {
    expect(groupTitle("Flur", "Zone 3", 1)).toBe("Flur · Zone 3 · 1 Pflanze");
    expect(groupTitle("Wohnzimmer", "Zone 2", 2)).toBe("Wohnzimmer · Zone 2 · 2 Pflanzen");
  });

  it("US-QS-14 an unknown zone is named, a zone that is not loaded yet is left out (P-08)", () => {
    expect(groupTitle("Flur", null, 1)).toBe("Flur · Zone unbekannt · 1 Pflanze");
    expect(groupTitle("Flur", undefined, 1)).toBe("Flur · 1 Pflanze");
  });

  it("US-QS-14 the choices list the known places alphabetically, then the unknown place, then the unplaced plants", () => {
    const choices = locationChoices(
      [
        { locationId: "l2", location: "Wohnzimmer", count: 2 },
        { locationId: "l1", location: "Flur", count: 1 },
        { locationId: "l3", location: null, count: 1 },
      ],
      3,
    );
    expect(choices).toEqual([
      { key: "l1", label: "Flur", count: 1 },
      { key: "l2", label: "Wohnzimmer", count: 2 },
      { key: "l3", label: UNKNOWN_PLACE, count: 1 },
      { key: UNPLACED_KEY, label: UNKNOWN_PLACE, count: 3 },
    ]);
  });

  it("US-QS-14 no plants give no choices", () => {
    expect(locationChoices([], 0)).toEqual([]);
  });
});
