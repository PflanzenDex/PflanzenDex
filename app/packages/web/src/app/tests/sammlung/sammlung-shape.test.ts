import { describe, expect, it } from "vitest";
import { sammlungShapeOf, sammlungViewOf } from "../../sammlung-view";

const all = () => true;

describe("sammlungViewOf (US-QS-14, issue 1727)", () => {
  it("US-QS-14 issue 1727 · the address names the mode, else the device, else the plants", () => {
    expect(sammlungViewOf("?view=species", "wishlist", all)).toBe("species");
    expect(sammlungViewOf("", "wishlist", all)).toBe("wishlist");
    expect(sammlungViewOf("", null, all)).toBe("plants");
    expect(sammlungViewOf("?view=bogus", "equipment", all)).toBe("equipment");
  });

  it("US-QS-14 issue 1727 · a mode the keeper switched off falls back to the plants (US-ONB-09)", () => {
    expect(sammlungViewOf("?view=wishlist", null, (v) => v !== "wishlist")).toBe("plants");
  });
});

describe("sammlungShapeOf (US-QS-14, issue 1727)", () => {
  it("US-QS-14 issue 1727 · the shape carries the grouping of the plants and the open locations", () => {
    expect(sammlungShapeOf("?view=plants&group=phase&manage=locations", null, all)).toEqual({
      view: "plants",
      sort: "pokedex",
      group: "phase",
      managing: true,
    });
  });

  it("US-QS-14 issue 1727 · the arrangement of the species is the difficulty when the address says so", () => {
    expect(sammlungShapeOf("?view=species&sort=difficulty", null, all)).toEqual({
      view: "species",
      sort: "difficulty",
      group: "all",
      managing: false,
    });
  });

  it("US-QS-14 issue 1727 · the locations open over the plants only, never over another mode", () => {
    expect(sammlungShapeOf("?view=wishlist&manage=locations", null, all).managing).toBe(false);
    expect(sammlungShapeOf("?manage=locations", null, all).managing).toBe(true);
  });

  it("US-QS-14 issue 1727 · an unknown grouping shows all plants", () => {
    expect(sammlungShapeOf("?group=whatever", null, all).group).toBe("all");
  });
});
