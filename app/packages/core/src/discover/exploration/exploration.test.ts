import { describe, expect, it } from "vitest";
import type { CollectorCard, TaxonCardRow } from "../../pokedex";
import { InMemoryWishes } from "../../wishlist/test-helpers";
import { DECK_SIZE, EXPLORATION_PER_DECK, suggestions } from "../suggestions";
import { explorationPlan } from "./index";

/** The picks of deck number `deck` (1-based); none once the groups are used up. */
const explorationPicks = (
  cards: readonly CollectorCard[],
  wished: readonly string[],
  seed: string,
  deck: number,
  count: number,
) => explorationPlan(cards, wished, seed, count)[deck - 1] ?? [];

const card = (species: string, order: string | null, extra: Partial<CollectorCard> = {}) =>
  ({
    number: 1,
    species,
    state: "missing",
    germanName: null,
    germanNameFull: null,
    summary: null,
    summaryLanguage: null,
    genus: species.split(" ")[0] ?? species,
    genusSpeciesCount: null,
    speciesPoor: false,
    difficulty: null,
    lightZone: null,
    imageUrl: null,
    sourceUrl: null,
    family: `${order ?? "Unordered"}aceae`,
    order,
    caughtDate: null,
    specimenCount: 0,
    ...extra,
  }) satisfies CollectorCard;
const species = (picks: readonly { card: CollectorCard }[]) => picks.map((p) => p.card.species);

// Three orders without a caught species (sizes 1, 2, 3) and one order with a caught species.
const cards = [
  card("Ficus lyrata", "Rosales", { state: "caught" }),
  card("Ficus elastica", "Rosales"),
  card("Aloe vera", "Asparagales"),
  card("Aloe arborescens", "Asparagales"),
  card("Aloe ferox", "Asparagales"),
  card("Zamia furfuracea", "Cycadales"),
  card("Nepenthes alata", "Caryophyllales"),
  card("Nepenthes rafflesiana", "Caryophyllales"),
];

describe("US-ENT-06 exploration picks", () => {
  it("US-ENT-06 takes species of orders without a caught species, the order with the fewest species first", () => {
    const picks = explorationPicks(cards, [], "anna|2026-10-10", 1, 2);
    expect(picks.map((p) => p.card.order)).toEqual(["Cycadales", "Caryophyllales"]);
    expect(picks.every((p) => p.card.state === "missing")).toBe(true);
    expect(picks[0]?.reason).toBe("Aus der Ordnung Cycadales hast du noch keine Art im Pokédex.");
  });

  it("US-ENT-06 the next deck continues with the next orders", () => {
    const second = explorationPicks(cards, [], "anna|2026-10-10", 2, 2);
    expect(second.map((p) => p.card.order)).toEqual(["Asparagales"]);
    expect(explorationPicks(cards, [], "anna|2026-10-10", 3, 2)).toEqual([]);
  });

  it("US-ENT-06 never picks a species with a wish, and an order without a rest is skipped", () => {
    const wished = ["Zamia furfuracea"];
    const picks = explorationPicks(cards, wished, "anna|2026-10-10", 1, 2);
    expect(picks.map((p) => p.card.order)).toEqual(["Caryophyllales", "Asparagales"]);
  });

  it("US-ENT-06 a family without a caught species counts too, inside an order that has one", () => {
    const more = [...cards, card("Morus alba", "Rosales", { family: "Moraceae" })];
    const picks = explorationPicks(more, [], "anna|2026-10-10", 1, 4);
    const morus = picks.find((p) => p.card.species === "Morus alba");
    expect(morus?.reason).toBe("Aus der Familie Moraceae hast du noch keine Art im Pokédex.");
  });

  it("US-ENT-06 the pick is fixed per account, day and deck number (FR-ENT-05)", () => {
    const again = explorationPicks(cards, [], "anna|2026-10-10", 1, 2);
    expect(species(again)).toEqual(species(explorationPicks(cards, [], "anna|2026-10-10", 1, 2)));
  });

  it("US-ENT-06 picks the species inside an order by account and day, so the choice varies", () => {
    const wide = Array.from({ length: 40 }, (_, i) => card(`Aloe s${i}`, "Asparagales"));
    const seen = new Set<string>();
    for (const seed of ["a|1", "b|1", "a|2", "c|3", "d|4", "e|5"])
      seen.add(species(explorationPicks(wide, [], seed, 1, 1))[0] ?? "");
    expect(seen.size).toBeGreaterThan(1);
  });

  it("US-ENT-06 gives no pick when every order and family has a caught species", () => {
    const owned = [
      card("Ficus lyrata", "Rosales", { state: "caught" }),
      card("Ficus elastica", "Rosales"),
      card("Aloe vera", "Asparagales", { state: "caught" }),
      card("Aloe ferox", "Asparagales"),
    ];
    expect(explorationPicks(owned, [], "anna|2026-10-10", 1, 2)).toEqual([]);
  });

  it("US-ENT-06 unknown orders and families give no pick (P-08)", () => {
    const unknown = [card("Mystery a", null, { family: null })];
    expect(explorationPicks(unknown, [], "x", 1, 2)).toEqual([]);
  });
});

const row = (latinName: string, order: string, family = `${order}aceae`): TaxonCardRow => ({
  latinName,
  genus: latinName.split(" ")[0] ?? latinName,
  family,
  order,
  summary: null,
  summaryLanguage: null,
  imageUrl: null,
  pageUrl: null,
  genusSpeciesCount: null,
});

describe("US-ENT-06 the deck", () => {
  const tree = [
    row("Ficus a", "Rosales"),
    ...Array.from({ length: 12 }, (_, i) => row(`Ficus s${i}`, "Rosales")),
    row("Zamia furfuracea", "Cycadales"),
    row("Nepenthes alata", "Caryophyllales"),
    row("Nepenthes rafflesiana", "Caryophyllales"),
  ];
  const deps = (day: string) => ({
    ownership: {
      specimens: { list: async () => [] },
      species: { find: async () => null, findMany: async () => [] },
    },
    tree: { tree: async () => tree, facts: async () => [] },
    wishes: new InMemoryWishes(),
    clock: () => new Date(`${day}T12:00:00Z`),
  });
  const deck = (day: string, n = 1) => suggestions(deps(day), "anna", "Europe/Berlin", n);

  it("US-ENT-06 puts the exploration cards into the deck, marked as something different, within the deck size", async () => {
    const first = await deck("2026-10-10");
    expect(first.suggestions).toHaveLength(DECK_SIZE);
    const exploring = first.suggestions.filter((s) => s.exploration);
    expect(exploring).toHaveLength(EXPLORATION_PER_DECK);
    expect(exploring.map((s) => s.species)).toContain("Zamia furfuracea");
    expect(exploring.some((s) => s.species.startsWith("Nepenthes"))).toBe(true);
    expect(exploring[0]?.reasons[0]).toMatch(/^Aus der Ordnung/);
    expect(
      first.suggestions
        .filter((s) => !s.exploration)
        .every((s) => !s.reasons[0]?.includes("Aus der Ordnung")),
    ).toBe(true);
  });

  it("US-ENT-06 the same account, day and deck number give the same deck, a card appears once", async () => {
    const a = await deck("2026-10-10");
    expect(await deck("2026-10-10")).toEqual(a);
    const names = a.suggestions.map((s) => s.species);
    expect(new Set(names).size).toBe(names.length);
  });

  it("US-ENT-06 no card is shown twice across the decks of one day", async () => {
    const all: string[] = [];
    for (let n = 1; n <= 3; n++)
      all.push(...(await deck("2026-10-10", n)).suggestions.map((s) => s.species));
    expect(new Set(all).size).toBe(all.length);
    expect(all).toHaveLength(tree.length);
  });
});
