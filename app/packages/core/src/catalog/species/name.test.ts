import { describe, expect, it } from "vitest";
import { normalize, parseLatin } from "./name";

describe("US-BES-01 Latin name (DM-BES-01: genus + epithet, optional cultivar)", () => {
  it("splits genus and epithet and brings the spelling into normal form", () => {
    expect(parseLatin("  dracaena   TRIFASCIATA ")).toEqual({
      genus: "Dracaena",
      epithet: "trifasciata",
      cultivar: null,
      display: "Dracaena trifasciata",
    });
  });

  it("reads a cultivar only in quotation marks; it does not belong to the epithet", () => {
    expect(parseLatin("Dracaena trifasciata 'Moonshine'")).toMatchObject({
      epithet: "trifasciata",
      cultivar: "Moonshine",
      display: "Dracaena trifasciata 'Moonshine'",
    });
    expect(parseLatin("Echeveria 'Perle von Nürnberg'")).toMatchObject({
      genus: "Echeveria",
      epithet: null,
      cultivar: "Perle von Nürnberg",
    });
  });

  it("allows a species without epithet (genus only)", () => {
    expect(parseLatin("Sansevieria")).toMatchObject({
      genus: "Sansevieria",
      epithet: null,
    });
  });

  it.each([
    "",
    "a",
    "Aloe vera var. chinensis",
    "Aloe 'offen",
    "Aloe vera 'A' 'B'",
    "123",
    "Aloe, vera",
  ])("rejects %j as invalid (var./subsp. belong to the specimen, not into the name)", (t) => {
    expect(parseLatin(t)).toBeNull();
  });
});

describe("normalization for search and duplicates", () => {
  it("ignores case, accents, ß and multiple spaces", () => {
    expect(normalize("  Königin   der Nacht")).toBe("konigin der nacht");
    expect(normalize("Straße")).toBe("strasse");
    expect(normalize("Dracaena-trifasciata")).toBe("dracaena trifasciata");
  });
});
