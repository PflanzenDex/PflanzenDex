import { describe, expect, it } from "vitest";
import type { CollectorCard, TaxonCardRow } from "../../pokedex";
import { InMemoryWishes } from "../../wishlist/test-helpers";
import { candidatesOf, suggestions } from "../suggestions/suggestions";
import { preferenceFactor, tallyOf } from "./index";

const card = (species: string, extra: Partial<CollectorCard> = {}): CollectorCard => ({
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
  difficulty: 2,
  lightZone: 3,
  imageUrl: null,
  sourceUrl: null,
  family: "Moraceae",
  caughtDate: null,
  specimenCount: 0,
  ...extra,
});
const names = (list: readonly { species: string }[]) => list.map((s) => s.species);

describe("US-ENT-05 preferences from my decisions", () => {
  it("US-ENT-05 without decisions every factor is 1", () => {
    const tally = tallyOf([card("Ficus lyrata")], { yes: [], no: [] });
    expect(preferenceFactor(tally, card("Ficus carica"))).toBe(1);
  });

  it("US-ENT-05 the factor of an attribute value is (yes + 1) / (no + 1): 5 times No for a family gives 1/6", () => {
    const decided = ["Sedum a", "Sedum b", "Echeveria c", "Aeonium d", "Aloe e"].map((s, i) =>
      card(s, { family: "Crassulaceae", genus: s.split(" ")[0] ?? s, lightZone: 10 + i }),
    );
    const tally = tallyOf(decided, { yes: [], no: decided.map((c) => c.species) });
    const other = card("Kalanchoe f", {
      family: "Crassulaceae",
      lightZone: null,
      difficulty: null,
    });
    expect(preferenceFactor(tally, other)).toBeCloseTo(1 / 6);
  });

  it("US-ENT-05 multiplies the factors of family, genus, light zone and difficulty of the candidate", () => {
    const liked = card("Ficus lyrata", { family: "Moraceae", lightZone: 3, difficulty: 2 });
    const tally = tallyOf([liked], { yes: [liked.species], no: [] });
    // family 2/1, genus 2/1, zone 2/1, difficulty 2/1
    expect(preferenceFactor(tally, card("Ficus carica"))).toBe(16);
    // only the family matches
    const some = card("Morus alba", { genus: "Morus", lightZone: 4, difficulty: 1 });
    expect(preferenceFactor(tally, some)).toBe(2);
  });

  it("US-ENT-05 an unknown attribute is neutral (P-08, FR-ENT-04)", () => {
    const liked = card("Ficus lyrata");
    const tally = tallyOf([liked], { yes: [liked.species], no: [] });
    const unknown = card("Morus alba", {
      genus: "Morus",
      family: null,
      lightZone: null,
      difficulty: null,
    });
    expect(preferenceFactor(tally, unknown)).toBe(1);
  });

  it("US-ENT-05 a decision on a species outside the catalog changes nothing", () => {
    const tally = tallyOf([card("Ficus lyrata")], { yes: ["Fantasia nova"], no: [] });
    expect(preferenceFactor(tally, card("Ficus carica"))).toBe(1);
  });

  it("US-ENT-05 matches the wish name like the wishlist does (letter case, spaces)", () => {
    const tally = tallyOf([card("Ficus lyrata")], { yes: ["FICUS  lyrata"], no: [] });
    expect(preferenceFactor(tally, card("Ficus carica"))).toBeGreaterThan(1);
  });
});

describe("US-ENT-05 the deck follows the decisions", () => {
  const cards = [
    card("Sedum a", { family: "Crassulaceae", genus: "Sedum", lightZone: 4, difficulty: 1 }),
    card("Sedum b", { family: "Crassulaceae", genus: "Sedum", lightZone: 4, difficulty: 1 }),
    card("Sedum c", { family: "Crassulaceae", genus: "Sedum", lightZone: 4, difficulty: 1 }),
    card("Ficus lyrata"),
    card("Aloe vera", { family: "Asphodelaceae", genus: "Aloe", lightZone: 2, difficulty: 3 }),
  ];

  it("US-ENT-05 without decisions the order is the one of US-ENT-01 and US-ENT-03", () => {
    expect(names(candidatesOf(cards, []))).toEqual(
      names(candidatesOf(cards, [], [], { yes: [], no: [] })),
    );
  });

  it("US-ENT-05 species of a rejected family come later, but are not removed", () => {
    const decided = ["Sedum a"];
    const list = candidatesOf(cards, decided, [], { yes: [], no: decided });
    expect(names(list)).toEqual(["Ficus lyrata", "Aloe vera", "Sedum b", "Sedum c"]);
  });

  it("US-ENT-05 species of a liked family come first and say why with the own count, no percentage", () => {
    const decided = ["Sedum a"];
    const [first] = candidatesOf(cards, decided, [], { yes: decided, no: [] });
    expect(first?.species).toBe("Sedum b");
    expect(first?.reasons.join(" ")).toContain(
      "Du hast 1 Art der Gattung Sedum auf der Wunschliste.",
    );
    expect(first?.reasons.join(" ")).not.toMatch(/%|match/i);
  });

  it("US-ENT-05 gives no preference reason for a family with more No than Yes", () => {
    const decided = ["Sedum a", "Sedum b"];
    const list = candidatesOf(cards, decided, [], { yes: ["Sedum a"], no: ["Sedum b"] });
    expect(list.find((s) => s.species === "Sedum c")?.reasons.join(" ")).not.toMatch(
      /gewünscht|Wunschliste/,
    );
  });

  it("US-ENT-05 the same decisions give the same order (FR-ENT-05)", () => {
    const decided = { yes: ["Sedum a"], no: ["Aloe vera"] };
    expect(candidatesOf(cards, [...decided.yes, ...decided.no], [], decided)).toEqual(
      candidatesOf(cards, [...decided.yes, ...decided.no], [], decided),
    );
  });
});

const row = (latinName: string, family: string): TaxonCardRow => ({
  latinName,
  genus: latinName.split(" ")[0] ?? latinName,
  family,
  order: "Order",
  summary: null,
  summaryLanguage: null,
  imageUrl: null,
  pageUrl: null,
  genusSpeciesCount: null,
});

describe("US-ENT-05 derived live from the own wishes", () => {
  const tree = [
    row("Sedum a", "Crassulaceae"),
    row("Sedum b", "Crassulaceae"),
    row("Ficus lyrata", "Moraceae"),
    row("Ficus carica", "Moraceae"),
  ];
  const deps = (wishes: InMemoryWishes) => ({
    ownership: {
      specimens: { list: async () => [] },
      species: { find: async () => null, findMany: async () => [] },
    },
    tree: { tree: async () => tree, facts: async () => [] },
    wishes,
  });
  const order = async (wishes: InMemoryWishes, userId: string) =>
    (await suggestions(deps(wishes), userId, "Europe/Berlin")).suggestions.map((s) => s.species);

  it("US-ENT-05 open and bought wishes count as yes, discarded ones as no, of any source", async () => {
    const wishes = new InMemoryWishes();
    wishes.seed("anna", { id: "1", name: "Sedum a", status: "discarded" });
    wishes.seed("anna", { id: "2", name: "Ficus lyrata", status: "bought" });
    expect(await order(wishes, "anna")).toEqual(["Ficus carica", "Sedum b"]);
  });

  it("US-ENT-05 only the own decisions count: another account sees the neutral order (FR-ENT-07)", async () => {
    const wishes = new InMemoryWishes();
    wishes.seed("anna", { id: "1", name: "Sedum a", status: "discarded" });
    wishes.seed("anna", { id: "2", name: "Ficus lyrata", status: "wishlist" });
    const neutral = await order(new InMemoryWishes(), "ben");
    expect(await order(wishes, "ben")).toEqual(neutral);
  });

  it("US-ENT-05 resetting a decision changes the next deck, because nothing is stored twice (NFR-04)", async () => {
    const wishes = new InMemoryWishes();
    const neutral = await order(wishes, "anna");
    wishes.seed("anna", { id: "1", name: "Sedum a", status: "discarded" });
    expect((await order(wishes, "anna")).at(-1)).toBe("Sedum b");
    wishes.rows.length = 0;
    expect(await order(wishes, "anna")).toEqual(neutral);
  });
});
