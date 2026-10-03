import { describe, expect, it } from "vitest";
import { normalisiere, parseLateinisch } from "./name";

describe("US-BES-01 lateinischer Name (DM-BES-01: Gattung + Epitheton, optional Sorte)", () => {
  it("zerlegt Gattung und Epitheton und bringt die Schreibweise in Normalform", () => {
    expect(parseLateinisch("  dracaena   TRIFASCIATA ")).toEqual({
      gattung: "Dracaena",
      epitheton: "trifasciata",
      sorte: null,
      anzeige: "Dracaena trifasciata",
    });
  });

  it("liest eine Sorte nur in Anführungszeichen; sie gehört nicht zum Epitheton", () => {
    expect(parseLateinisch("Dracaena trifasciata 'Moonshine'")).toMatchObject({
      epitheton: "trifasciata",
      sorte: "Moonshine",
      anzeige: "Dracaena trifasciata 'Moonshine'",
    });
    expect(parseLateinisch("Echeveria 'Perle von Nürnberg'")).toMatchObject({
      gattung: "Echeveria",
      epitheton: null,
      sorte: "Perle von Nürnberg",
    });
  });

  it("erlaubt eine Art ohne Epitheton (nur Gattung)", () => {
    expect(parseLateinisch("Sansevieria")).toMatchObject({
      gattung: "Sansevieria",
      epitheton: null,
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
  ])("weist %j als ungültig zurück (var./subsp. gehören zum Exemplar, nicht in den Namen)", (t) => {
    expect(parseLateinisch(t)).toBeNull();
  });
});

describe("Normierung für Suche und Dubletten", () => {
  it("ignoriert Groß-/Kleinschreibung, Akzente, ß und Mehrfach-Leerzeichen", () => {
    expect(normalisiere("  Königin   der Nacht")).toBe("konigin der nacht");
    expect(normalisiere("Straße")).toBe("strasse");
    expect(normalisiere("Dracaena-trifasciata")).toBe("dracaena trifasciata");
  });
});
