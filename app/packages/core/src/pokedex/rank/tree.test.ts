import { describe, expect, it } from "vitest";
import type { SpeciesFacts, TaxonCardRow } from "../cards";
import { milestoneOverview, milestones } from "../milestones";
import { collectorProgress } from "./rank";
import { milestoneTreeOf, pokedexTreeOf, treeTotalsOf, type TreeRow } from "./tree";

const taxon = (latinName: string, family: string | null, order: string | null): TaxonCardRow => ({
  latinName,
  genus: latinName.split(" ")[0] ?? latinName,
  family,
  order,
  summary: null,
  summaryLanguage: null,
  imageUrl: null,
  pageUrl: null,
  genusSpeciesCount: null,
  natureRarity: { iucn: null, occurrences: null },
});

const facts = (latinName: string, germanName: string | null): SpeciesFacts => ({
  latinName,
  germanName,
  difficulty: null,
  lightZone: null,
});

const row = (latin: string, family: string | null, order: string | null): TreeRow => ({
  latin,
  german: null,
  family,
  genus: latin.split(" ")[0] ?? latin,
  order,
});

describe("US-POK-11 the tree rows of the progress", () => {
  it("US-POK-11 before the first taxonomy build there is no tree, so nothing is invented (P-08)", () => {
    expect(pokedexTreeOf(null, [])).toBeNull();
  });

  it("US-POK-10 · US-POK-11 a built tree lists every species with its family, genus, order and the short German name", () => {
    const tree = pokedexTreeOf(
      [
        taxon("Opuntia microdasys", "Cactaceae", "Caryophyllales"),
        taxon("Citrus limon", null, null),
      ],
      [facts("Citrus limon", "Zitrone (Citrus)"), facts("Opuntia microdasys", null)],
    );
    expect(tree).toEqual({
      species: [
        { latin: "Citrus limon", german: "Zitrone", family: null, genus: "Citrus", order: null },
        {
          latin: "Opuntia microdasys",
          german: null,
          family: "Cactaceae",
          genus: "Opuntia",
          order: "Caryophyllales",
        },
      ],
    });
  });

  it("US-POK-11 the rows come in Latin name order, whatever order the tree was read in", () => {
    const a = pokedexTreeOf([taxon("Zeta zeta", "F", "O"), taxon("Alpha alpha", "F", "O")], []);
    const b = pokedexTreeOf([taxon("Alpha alpha", "F", "O"), taxon("Zeta zeta", "F", "O")], []);
    expect(a).toEqual(b);
    expect(a?.species.map((s) => s.latin)).toEqual(["Alpha alpha", "Zeta zeta"]);
  });
});

describe("US-POK-10 the totals of the tree", () => {
  const rows = [
    row("Citrus limon", "Rutaceae", "Sapindales"),
    row("Citrus aurantium", "Rutaceae", "Sapindales"),
    row("Opuntia microdasys", "Cactaceae", "Caryophyllales"),
    row("Aloe vera", null, null),
  ];

  it("US-POK-10 the species total counts every species, the orders count the distinct orders (K from the tree)", () => {
    expect(treeTotalsOf(rows, new Set())).toEqual({
      speciesTotal: 4,
      orderTotal: 2,
      ordersDiscovered: 0,
    });
  });

  it("US-POK-10 an order counts as discovered once one of its species is caught; a species without order is no order", () => {
    expect(treeTotalsOf(rows, new Set(["Citrus limon", "Aloe vera"]))).toEqual({
      speciesTotal: 4,
      orderTotal: 2,
      ordersDiscovered: 1,
    });
  });

  it("US-POK-10 the rank and the totals fit together: 2 caught of 4 is 50 %, Setzling is 3 away", () => {
    const totals = treeTotalsOf(rows, new Set(["Citrus limon", "Opuntia microdasys"]));
    expect(collectorProgress(2, totals).species).toEqual({ caught: 2, total: 4, percent: 50 });
    expect(collectorProgress(2, totals).orders).toEqual({ discovered: 2, total: 2 });
  });

  it("US-POK-10 a built tree without species has the total zero, not unknown", () => {
    expect(treeTotalsOf([], new Set())).toEqual({
      speciesTotal: 0,
      orderTotal: 0,
      ordersDiscovered: 0,
    });
  });
});

describe("US-POK-11 the groups of the milestones come from the tree", () => {
  const rows: TreeRow[] = [
    {
      latin: "Citrus limon",
      german: "Zitrone",
      family: "Rutaceae",
      genus: "Citrus",
      order: "Sapindales",
    },
    {
      latin: "Citrus aurantium",
      german: null,
      family: "Rutaceae",
      genus: "Citrus",
      order: "Sapindales",
    },
    {
      latin: "Opuntia microdasys",
      german: "Hasenohr-Kaktus",
      family: "Cactaceae",
      genus: "Opuntia",
      order: "Caryophyllales",
    },
    { latin: "Aloe vera", german: null, family: null, genus: "Aloe", order: null },
  ];

  it("US-POK-11 families, genera and orders hold their species; a species without family or order is in none of them", () => {
    const tree = milestoneTreeOf(rows);
    expect(tree.families.map((g) => g.name)).toEqual(["Cactaceae", "Rutaceae"]);
    expect(tree.families.find((g) => g.name === "Rutaceae")?.species).toEqual([
      { latin: "Citrus aurantium", german: null },
      { latin: "Citrus limon", german: "Zitrone" },
    ]);
    expect(tree.genera.map((g) => g.name)).toEqual(["Aloe", "Citrus", "Opuntia"]);
    expect(tree.orders.map((g) => g.name)).toEqual(["Caryophyllales", "Sapindales"]);
    expect(tree.families.flatMap((g) => g.species.map((s) => s.latin))).not.toContain("Aloe vera");
  });

  it("US-POK-11 a group has no German name of its own, so its title is the Latin name", () => {
    const tree = milestoneTreeOf(rows);
    expect(tree.families.every((g) => g.german === null)).toBe(true);
  });

  it("US-POK-11 the groups do not depend on the order of the rows (the same milestones on every read)", () => {
    expect(milestoneTreeOf([...rows].reverse())).toEqual(milestoneTreeOf(rows));
  });

  it("US-POK-11 the targets of the tree reach the milestones: a family of four has a connoisseur target of two", () => {
    const four: TreeRow[] = ["A a", "A b", "A c", "A d"].map((latin) => ({
      latin,
      german: null,
      family: "Testaceae",
      genus: "A",
      order: null,
    }));
    const list = milestones(milestoneTreeOf(four), new Map([["A a", "2026-01-01"]]));
    expect(list.find((m) => m.id === "family:Testaceae:connoisseur")).toMatchObject({
      current: 1,
      target: 2,
      remaining: 1,
    });
    expect(milestoneOverview(list).open.length).toBeGreaterThan(0);
  });
});
