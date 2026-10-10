import { describe, expect, it } from "vitest";
import type { CollectorCard, TaxonCardRow } from "../../pokedex";
import { InMemoryWishes } from "../../wishlist/test-helpers";
import { wishNameKey, type ZoneStock } from "../../wishlist";
import { DECK_SIZE, candidatesOf, deckOf, suggestions } from "./index";

const card = (species: string, extra: Partial<CollectorCard> = {}): CollectorCard => ({
  number: 1,
  species,
  state: "missing",
  germanName: null,
  germanNameFull: null,
  summary: "Ein Text.",
  summaryLanguage: "de",
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
  summaryLanguage: null,
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

  it("US-QS-14 keeps the language of the summary on the suggestion", () => {
    const [english] = candidatesOf([card("Aloe vera", { summaryLanguage: "en" })], []);
    expect(english?.summaryLanguage).toBe("en");
  });

  it("US-ENT-01 gives every card 1 to 3 reasons from own data and no percentage or match", () => {
    const cards = [
      card("Ficus lyrata", { state: "caught" }),
      card("Aloe vera", { family: "Asphodelaceae" }),
    ];
    const [aloe] = candidatesOf(cards, []);
    expect(aloe?.reasons).toEqual([
      "Neue Familie: Asphodelaceae fehlt dir noch im Pokédex.",
      "Diese Art hast du noch nicht gefangen.",
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

const stock = (...counts: number[]): ZoneStock[] =>
  counts.map((count, i) => ({ zoneId: `z${i + 2}`, name: `Lampe ${i + 2}`, count }));

describe("US-ENT-03 reasons from own data", () => {
  it("US-ENT-03 names the zone with the fewest plants as a reason, with the own count", () => {
    const [s] = candidatesOf([card("Aloe vera", { lightZone: 4 })], [], stock(3, 2, 1));
    expect(s?.reasons).toContain("Lampe 4 hat die wenigsten Pflanzen (1).");
  });

  it("US-ENT-03 says so when no plant stands in the zone yet, and names no reason when the zones are tied", () => {
    const [empty] = candidatesOf([card("Aloe vera", { lightZone: 3 })], [], stock(2, 0, 2));
    expect(empty?.reasons).toContain("In Lampe 3 steht noch keine Pflanze.");
    const [tie] = candidatesOf([card("Aloe vera", { lightZone: 3 })], [], stock(2, 2, 2));
    expect(tie?.reasons.join(" ")).not.toMatch(/wenigsten|keine Pflanze/);
    const [none] = candidatesOf([card("Aloe vera", { lightZone: 3 })], [], stock(0, 0, 0));
    expect(none?.reasons.join(" ")).not.toMatch(/wenigsten|keine Pflanze/);
  });

  it("US-ENT-03 gives no space reason for an unknown zone or a zone that is not the thinnest (P-08)", () => {
    const [unknown] = candidatesOf([card("Aloe vera", { lightZone: null })], [], stock(3, 2, 1));
    const [full] = candidatesOf([card("Aloe vera", { lightZone: 2 })], [], stock(3, 2, 1));
    const [cutting] = candidatesOf([card("Aloe vera", { lightZone: 1 })], [], stock(3, 2, 1));
    for (const s of [unknown, full, cutting]) expect(s?.reasons.join(" ")).not.toMatch(/wenigsten/);
  });

  it("US-ENT-03 shows at most 3 reasons, strongest first, none from the model and no percentage", () => {
    const cards = [
      card("Ficus lyrata", { state: "caught" }),
      card("Aloe vera", { family: "Asphodelaceae", lightZone: 4 }),
    ];
    const [s] = candidatesOf(cards, [], stock(3, 2, 1));
    expect(s?.reasons).toEqual([
      "Lampe 4 hat die wenigsten Pflanzen (1).",
      "Neue Familie: Asphodelaceae fehlt dir noch im Pokédex.",
      "Diese Art hast du noch nicht gefangen.",
    ]);
    expect(s?.reasons.length).toBeLessThanOrEqual(3);
    expect(s?.reasons.join(" ")).not.toMatch(/%|match/i);
  });

  it("US-ENT-03 orders by the shares a species has (space, new family), the tree order breaks ties (FR-ENT-02, FR-ENT-05)", () => {
    const cards = [
      card("Ficus lyrata", { state: "caught" }),
      card("Ficus elastica", { lightZone: 2 }),
      card("Ficus carica", { lightZone: 4 }),
      card("Aloe vera", { family: "Asphodelaceae", lightZone: 4 }),
      card("Aloe arborescens", { family: "Asphodelaceae", lightZone: 2 }),
    ];
    expect(names(candidatesOf(cards, [], stock(3, 2, 1)))).toEqual([
      "Aloe vera",
      "Ficus carica",
      "Aloe arborescens",
      "Ficus elastica",
    ]);
  });

  it("US-ENT-03 reads the stock of the account through the port and works without one", async () => {
    const asked: string[] = [];
    const deps = {
      ownership: {
        specimens: { list: async () => [] },
        species: { find: async () => null, findMany: async () => [] },
      },
      tree: { tree: async () => [row("Aloe vera", "Asphodelaceae")], facts: async () => [] },
      wishes: new InMemoryWishes(),
    };
    const bare = await suggestions(deps, "anna", "Europe/Berlin");
    expect(bare.suggestions[0]?.reasons.join(" ")).not.toMatch(/wenigsten/);
    const withStock = await suggestions(
      {
        ...deps,
        stock: {
          stock: async (userId) => {
            asked.push(userId);
            return stock(0, 0, 0);
          },
        },
      },
      "anna",
      "Europe/Berlin",
    );
    expect(asked).toEqual(["anna"]);
    expect(withStock.suggestions).toHaveLength(1);
  });
});
