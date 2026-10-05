import { describe, expect, it } from "vitest";
import { speciesDisplayName, specimenName } from "./name";

describe("US-BES-02 naming rule (DM-BES-03)", () => {
  it('the specimen is named like the species, with a marker "Species – marker" (en dash with spaces)', () => {
    expect(specimenName("Bogenhanf", null)).toBe("Bogenhanf");
    expect(specimenName("Bogenhanf", "rot")).toBe("Bogenhanf – rot");
  });

  it("the species is named German, else Latin (never an invented name, P-08)", () => {
    expect(speciesDisplayName({ germanName: "Bogenhanf", latinName: "Dracaena trifasciata" })).toBe(
      "Bogenhanf",
    );
    expect(speciesDisplayName({ germanName: null, latinName: "Dracaena trifasciata" })).toBe(
      "Dracaena trifasciata",
    );
  });
});
