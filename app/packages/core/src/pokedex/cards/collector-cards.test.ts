import { describe, expect, it } from "vitest";
import type { CaughtSpecies } from "../types";
import {
  collectorCards,
  shortGermanName,
  type SpeciesFacts,
  type TaxonCardRow,
} from "./collector-cards";

const row = (latinName: string, extra: Partial<TaxonCardRow> = {}): TaxonCardRow => ({
  latinName,
  genus: latinName.split(" ")[0] ?? latinName,
  family: "Moraceae",
  order: "Rosales",
  summary: "Ein Baum.",
  imageUrl: "https://upload.example/ficus.jpg",
  pageUrl: "https://de.wikipedia.org/wiki/Ficus",
  genusSpeciesCount: 800,
  ...extra,
});
const facts = (latinName: string, extra: Partial<SpeciesFacts> = {}): SpeciesFacts => ({
  latinName,
  germanName: "Birkenfeige (Zimmerlinde)",
  difficulty: 1,
  lightZone: 3,
  ...extra,
});
const caught = (species: string, extra: Partial<CaughtSpecies> = {}): CaughtSpecies => ({
  species,
  speciesId: "s1",
  source: null,
  genus: species.split(" ")[0] ?? species,
  chips: [],
  specimenCount: 1,
  caughtDate: { date: "2026-03-05", source: "caught_at" },
  germanName: null,
  familyLatin: null,
  familyGerman: null,
  genusSpeciesCount: null,
  ...extra,
});

describe("US-POK-01 collector cards", () => {
  it("US-POK-01 numbers the cards consecutively in tree order (order, family, genus, species)", () => {
    const cards = collectorCards(
      [
        row("Zamia furfuracea", { order: "Cycadales", family: "Zamiaceae" }),
        row("Ficus lyrata"),
        row("Ficus benjamina"),
        row("Aloe vera", { order: "Asparagales", family: "Asphodelaceae" }),
      ],
      [],
      [],
    );
    expect(cards.map((c) => [c.number, c.species])).toEqual([
      [1, "Aloe vera"],
      [2, "Zamia furfuracea"],
      [3, "Ficus benjamina"],
      [4, "Ficus lyrata"],
    ]);
  });

  it("US-POK-01 a species without order sorts after the known ones (P-08)", () => {
    const cards = collectorCards(
      [row("Ficus lyrata", { order: null, family: null }), row("Aloe vera", { order: "Z" })],
      [],
      [],
    );
    expect(cards.map((c) => c.species)).toEqual(["Aloe vera", "Ficus lyrata"]);
  });

  it("US-POK-01 a caught species is derived from the ownership, never stored", () => {
    const [card] = collectorCards(
      [row("Ficus benjamina")],
      [],
      [caught("Ficus benjamina", { specimenCount: 3 })],
    );
    expect(card).toMatchObject({
      state: "caught",
      caughtDate: { date: "2026-03-05", source: "caught_at" },
      specimenCount: 3,
    });
  });

  it("US-POK-01 a species that is not caught yet is a missing card with name, text and image link", () => {
    const [card] = collectorCards([row("Ficus benjamina")], [facts("Ficus benjamina")], []);
    expect(card).toMatchObject({
      state: "missing",
      species: "Ficus benjamina",
      germanName: "Birkenfeige",
      germanNameFull: "Birkenfeige (Zimmerlinde)",
      summary: "Ein Baum.",
      imageUrl: "https://upload.example/ficus.jpg",
      caughtDate: null,
      specimenCount: 0,
    });
  });

  it("US-POK-01 a species the catalog does not know keeps its card with unknown values (P-08)", () => {
    const [card] = collectorCards([row("Ficus benjamina")], [], []);
    expect(card).toMatchObject({ germanName: null, difficulty: null, lightZone: null });
  });

  it("US-POK-01 cuts the addition in parentheses off the short German name", () => {
    expect(shortGermanName("Birkenfeige (Zimmerlinde)")).toBe("Birkenfeige");
    expect(shortGermanName("Efeutute")).toBe("Efeutute");
    expect(shortGermanName(null)).toBeNull();
  });

  it("US-POK-01 unknown values stay null instead of invented ones (P-08)", () => {
    const [card] = collectorCards(
      [
        row("Ficus benjamina", {
          summary: null,
          imageUrl: null,
          pageUrl: null,
          genusSpeciesCount: null,
        }),
      ],
      [facts("Ficus benjamina", { germanName: null, difficulty: null, lightZone: null })],
      [],
    );
    expect(card).toMatchObject({
      summary: null,
      imageUrl: null,
      sourceUrl: null,
      genusSpeciesCount: null,
      speciesPoor: false,
      germanName: null,
      difficulty: null,
      lightZone: null,
    });
  });

  it("US-POK-01 flags a genus of at most 10 species (GBIF) as species-poor", () => {
    const cards = collectorCards(
      [
        row("Ficus benjamina", { genusSpeciesCount: 11 }),
        row("Lithops lesliei", { genusSpeciesCount: 10 }),
      ],
      [],
      [],
    );
    expect(cards.map((c) => c.speciesPoor)).toEqual([false, true]);
  });

  it("US-POK-01 links the source of a card that has a text or image", () => {
    const [card] = collectorCards([row("Ficus benjamina")], [], []);
    expect(card?.sourceUrl).toBe("https://de.wikipedia.org/wiki/Ficus");
  });
});
