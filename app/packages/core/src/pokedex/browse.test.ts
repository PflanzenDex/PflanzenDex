import { describe, expect, it } from "vitest";
import { browsePokedex, type CaughtSpecies } from "./index";

const card = (species: string, extra: Partial<CaughtSpecies> = {}): CaughtSpecies => ({
  species,
  genus: species.split(" ")[0] ?? species,
  chips: [],
  specimenCount: 1,
  caughtDate: { date: "2026-01-01", source: "caught_at" },
  germanName: null,
  familyLatin: null,
  familyGerman: null,
  genusSpeciesCount: null,
  ...extra,
});
const ficus = card("Ficus lyrata", {
  germanName: "Geigenfeige",
  familyLatin: "Moraceae",
  familyGerman: "Maulbeergewächse",
  caughtDate: { date: "2026-03-05", source: "caught_at" },
});
const elastica = card("Ficus elastica", {
  germanName: "Gummibaum",
  familyLatin: "Moraceae",
  familyGerman: "Maulbeergewächse",
  caughtDate: { date: "2026-08-01", source: "created_at" },
  genusSpeciesCount: 800,
});
const aloe = card("Aloe vera", {
  germanName: "Echte Aloe",
  familyLatin: "Asphodelaceae",
  familyGerman: null,
  caughtDate: { date: null, source: "unknown" },
  genusSpeciesCount: 9,
});
const citrus = card("Citrus limon", { germanName: "Zitrone", genusSpeciesCount: 12 });
const all = [ficus, elastica, aloe, citrus];
const names = (r: readonly CaughtSpecies[]) => r.map((c) => c.species);

describe("US-POK-08 search, filter, sort", () => {
  it("US-POK-08 search is case-insensitive over species name, German name, genus and family", () => {
    const find = (query: string) =>
      names(browsePokedex(all, { query, filter: "all", sort: "alphabetical" }).flat);
    expect(find("FICUS")).toEqual(["Ficus elastica", "Ficus lyrata"]);
    expect(find("geigen")).toEqual(["Ficus lyrata"]);
    expect(find("citr")).toEqual(["Citrus limon"]);
    expect(find("asphodel")).toEqual(["Aloe vera"]);
    expect(find("maulbeer")).toEqual(["Ficus elastica", "Ficus lyrata"]);
    expect(find("  zitrone ")).toEqual(["Citrus limon"]);
  });

  it("US-POK-08 an empty search keeps everything and a search without hit is empty", () => {
    expect(
      browsePokedex(all, { query: "", filter: "all", sort: "alphabetical" }).flat,
    ).toHaveLength(4);
    expect(browsePokedex(all, { query: "xyz", filter: "all", sort: "alphabetical" }).flat).toEqual(
      [],
    );
  });

  it("US-POK-08 filter Caught keeps every card (the page lists caught species only)", () => {
    expect(
      browsePokedex(all, { query: "", filter: "caught", sort: "alphabetical" }).flat,
    ).toHaveLength(4);
  });

  it("US-POK-08 filter Species-poor keeps genus counts up to 10 and never guesses an unknown count", () => {
    const r = browsePokedex(all, { query: "", filter: "species_poor", sort: "alphabetical" });
    expect(names(r.flat)).toEqual(["Aloe vera"]);
  });

  it("US-POK-08 sorted alphabetically by species name", () => {
    expect(
      names(browsePokedex(all, { query: "", filter: "all", sort: "alphabetical" }).flat),
    ).toEqual(["Aloe vera", "Citrus limon", "Ficus elastica", "Ficus lyrata"]);
  });

  it("US-POK-08 sorted by catch date: newest first, without date after", () => {
    expect(
      names(browsePokedex(all, { query: "", filter: "all", sort: "catch_date" }).flat),
    ).toEqual(["Ficus elastica", "Ficus lyrata", "Citrus limon", "Aloe vera"]);
  });

  it("US-POK-08 sorted by species count ascending, unknown last", () => {
    expect(
      names(browsePokedex(all, { query: "", filter: "all", sort: "species_count" }).flat),
    ).toEqual(["Aloe vera", "Citrus limon", "Ficus elastica", "Ficus lyrata"]);
  });

  it("US-POK-08 grouped by family with n / m, m unknown without a tree, unknown family last", () => {
    const r = browsePokedex(all, { query: "", filter: "all", sort: "family" });
    expect(r.groups.map((g) => [g.family, g.caught, g.total, names(g.species)])).toEqual([
      ["Asphodelaceae", 1, null, ["Aloe vera"]],
      ["Moraceae", 2, null, ["Ficus elastica", "Ficus lyrata"]],
      [null, 1, null, ["Citrus limon"]],
    ]);
    expect(r.flat).toEqual([]);
  });

  it("US-POK-08 a flat sort has no groups", () => {
    expect(browsePokedex(all, { query: "", filter: "all", sort: "catch_date" }).groups).toEqual([]);
  });

  it("US-POK-08 search and filter apply inside groups", () => {
    const r = browsePokedex(all, { query: "ficus", filter: "all", sort: "family" });
    expect(r.groups.map((g) => g.family)).toEqual(["Moraceae"]);
  });
});
