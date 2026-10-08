import { describe, expect, it } from "vitest";
import type { CollectorCard, TaxonCardRow } from "../../pokedex";
import { InMemoryWishes } from "../../wishlist/test-helpers";
import { wishNameKey } from "../../wishlist";
import { DECK_SIZE, candidatesOf, deckOf, suggestions } from "./index";

const card = (species: string, extra: Partial<CollectorCard> = {}): CollectorCard => ({
  number: 1,
  species,
  state: "missing",
  germanName: null,
  germanNameFull: null,
  summary: "Ein Text.",
  genus: species.split(" ")[0] ?? species,
  genusSpeciesCount: null,
  speciesPoor: false,
  difficulty: 2,
  lightZone: 3,
  imageUrl: "https://upload.example/x.jpg",
  sourceUrl: "https://de.wikipedia.org/wiki/X",
  family: "Moraceae",
  caughtDate: null,
  specimenCount: 0,
  ...extra,
});
const row = (latinName: string, family = "Moraceae"): TaxonCardRow => ({
  latinName,
  genus: latinName.split(" ")[0] ?? latinName,
  family,
  order: "Rosales",
  summary: null,
  imageUrl: null,
  pageUrl: null,
  genusSpeciesCount: null,
});
const names = (list: readonly { species: string }[]) => list.map((s) => s.species);

describe("US-ENT-01 suggestions", () => {
  it("US-ENT-01 suggests only species that are not caught and not on the wishlist", () => {
    const cards = [
      card("Ficus lyrata", { state: "caught" }),
      card("Ficus elastica"),
      card("Aloe vera"),
    ];
    expect(names(candidatesOf(cards, ["Aloe  Vera"]))).toEqual(["Ficus elastica"]);
  });

  it("US-ENT-01 gives every card 1 to 3 reasons from own data and no percentage or match", () => {
    const cards = [
      card("Ficus lyrata", { state: "caught" }),
      card("Aloe vera", { family: "Asphodelaceae" }),
    ];
    const [aloe] = candidatesOf(cards, []);
    expect(aloe?.reasons).toEqual([
      "Diese Art hast du noch nicht gefangen.",
      "Neue Familie: Asphodelaceae fehlt dir noch im Pokédex.",
    ]);
    expect(aloe?.reasons.join(" ")).not.toMatch(/%|match/i);
  });

  it("US-ENT-01 puts species of a new family first and keeps the tree order otherwise", () => {
    const cards = [
      card("Ficus lyrata", { state: "caught" }),
      card("Ficus elastica"),
      card("Aloe vera", { family: "Asphodelaceae" }),
      card("Ficus carica"),
    ];
    expect(names(candidatesOf(cards, []))).toEqual(["Aloe vera", "Ficus elastica", "Ficus carica"]);
  });

  it("US-ENT-01 shows unknown values as null and all DM-ENT-01 attributes as unknown", () => {
    const [s] = candidatesOf([card("Aloe vera", { difficulty: null, lightZone: null })], []);
    expect(s).toMatchObject({ difficulty: null, lightZone: null });
    expect(s?.attributes).toEqual({
      humidity: null,
      minTemperature: null,
      toxicToPets: null,
      growthSize: null,
    });
  });

  it("US-ENT-01 deals the deck in decks of the deck size and the same data gives the same deck", () => {
    const cards = Array.from({ length: DECK_SIZE + 3 }, (_, i) => card(`Ficus s${i}`));
    const all = candidatesOf(cards, []);
    expect(deckOf(all, 1).suggestions).toHaveLength(DECK_SIZE);
    expect(deckOf(all, 2).suggestions).toHaveLength(3);
    expect(deckOf(all, 1)).toEqual(deckOf(candidatesOf(cards, []), 1));
  });

  it("US-ENT-01 says why there is nothing: everything owned or decided, and what to do next", () => {
    const empty = deckOf([], 1).empty;
    expect(empty?.reason).toBe("all_decided");
    expect(empty?.text).toContain("Keine neuen Vorschläge");
    expect(empty?.nextAction).not.toBe("");
  });

  it("US-ENT-01 reads the deck of the account from catalog, ownership and wishes", async () => {
    const wishes = new InMemoryWishes();
    await wishes.create("anna", {
      name: "Aloe vera",
      nameKey: wishNameKey("Aloe vera"),
      german: null,
      targetZoneId: null,
      difficulty: null,
      reasoning: null,
      imageUrl: null,
      imageSource: null,
      license: null,
    });
    const deps = {
      ownership: {
        specimens: { list: async () => [] },
        species: { find: async () => null, findMany: async () => [] },
      },
      tree: {
        tree: async () => [row("Aloe vera", "Asphodelaceae"), row("Ficus lyrata")],
        facts: async () => [],
      },
      wishes,
    };
    const anna = await suggestions(deps, "anna", "Europe/Berlin");
    expect(names(anna.suggestions)).toEqual(["Ficus lyrata"]);
    const ben = await suggestions(deps, "ben", "Europe/Berlin");
    expect(names(ben.suggestions)).toEqual(["Aloe vera", "Ficus lyrata"]);
  });

  it("US-ENT-01 says the catalog is empty when the tree has no species", async () => {
    const deps = {
      ownership: {
        specimens: { list: async () => [] },
        species: { find: async () => null, findMany: async () => [] },
      },
      tree: { tree: async () => [], facts: async () => [] },
      wishes: new InMemoryWishes(),
    };
    expect((await suggestions(deps, "anna", "Europe/Berlin")).empty?.reason).toBe("catalog_empty");
  });
});
