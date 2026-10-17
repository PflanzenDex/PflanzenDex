import { describe, expect, it } from "vitest";
import { speciesKey } from "../index";

describe("US-POK-06 species key from the Latin name", () => {
  it("US-POK-06 takes the first two words and normalizes the case", () => {
    expect(speciesKey("ficus BENJAMINA")).toEqual({
      species: "Ficus benjamina",
      genus: "Ficus",
      epithet: "benjamina",
      chip: null,
    });
  });

  it("US-POK-06 skips the hybrid sign: Citrus x limon is Citrus limon", () => {
    expect(speciesKey("Citrus x limon").species).toBe("Citrus limon");
    expect(speciesKey("Citrus × limon").species).toBe("Citrus limon");
  });

  it("US-POK-06 additions do not flow into the species but become the chip", () => {
    const key = speciesKey("Opuntia microdasys var. albispina");
    expect(key.species).toBe("Opuntia microdasys");
    expect(key.chip).toBe("var. albispina");
    expect(speciesKey("Ficus lyrata subsp. lyrata").chip).toBe("subsp. lyrata");
    expect(speciesKey("Aloe vera f. variegata").chip).toBe("f. variegata");
    expect(speciesKey("Echeveria elegans 'Perle von Nürnberg'")).toMatchObject({
      species: "Echeveria elegans",
      chip: "'Perle von Nürnberg'",
    });
  });

  it("US-POK-06 a missing epithet gives no species (Hippeastrum, Parodia sp.)", () => {
    expect(speciesKey("Hippeastrum")).toMatchObject({ species: null, genus: "Hippeastrum" });
    expect(speciesKey("Parodia sp.")).toMatchObject({ species: null, genus: "Parodia" });
    expect(speciesKey("Parodia spp.").species).toBeNull();
    expect(speciesKey("Echeveria 'Perle'")).toMatchObject({ species: null, chip: "'Perle'" });
  });

  it("US-POK-06 an empty or blank name gives no species and no genus", () => {
    expect(speciesKey("   ")).toEqual({ species: null, genus: null, epithet: null, chip: null });
  });

  it("US-POK-06 surrounding and repeated white space does not matter", () => {
    expect(speciesKey("  Citrus   x   limon  ").species).toBe("Citrus limon");
  });
});
