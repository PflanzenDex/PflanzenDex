import { describe, expect, it } from "vitest";
import { artAnzeigename, exemplarName } from "./name";

describe("US-BES-02 Namensregel (DM-BES-03)", () => {
  it("das Exemplar heißt wie die Art, mit Kennzeichen „Art – Kennzeichen“ (Gedankenstrich mit Leerzeichen)", () => {
    expect(exemplarName("Bogenhanf", null)).toBe("Bogenhanf");
    expect(exemplarName("Bogenhanf", "rot")).toBe("Bogenhanf – rot");
  });

  it("die Art heißt deutsch, sonst lateinisch (nie ein erfundener Name, P-08)", () => {
    expect(
      artAnzeigename({ deutscherName: "Bogenhanf", lateinischerName: "Dracaena trifasciata" }),
    ).toBe("Bogenhanf");
    expect(artAnzeigename({ deutscherName: null, lateinischerName: "Dracaena trifasciata" })).toBe(
      "Dracaena trifasciata",
    );
  });
});
