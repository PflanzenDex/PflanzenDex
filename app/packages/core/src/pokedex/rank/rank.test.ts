import { describe, expect, it } from "vitest";
import { collectorProgress } from "./rank";

describe("US-POK-10 collector rank and progress", () => {
  it.each([
    [0, "seedling"],
    [4, "seedling"],
    [5, "sapling"],
    [14, "sapling"],
    [15, "young_plant"],
    [29, "young_plant"],
    [30, "bloomer"],
    [59, "bloomer"],
    [60, "treetop"],
    [99, "treetop"],
    [100, "botanist"],
    [250, "botanist"],
  ])("US-POK-10 %i caught species give the rank %s", (caught, rank) => {
    expect(collectorProgress(caught, null).rank).toBe(rank);
  });

  it("US-POK-10 names the next rank and how many species are missing until it", () => {
    const p = collectorProgress(12, null);
    expect(p.next).toEqual({ rank: "young_plant", remaining: 3 });
    expect(p.fraction).toBeCloseTo(0.7); // (12 - 5) / (15 - 5)
  });

  it("US-POK-10 the top rank has no next rank and a full bar", () => {
    const p = collectorProgress(100, null);
    expect(p.next).toBeNull();
    expect(p.fraction).toBe(1);
  });

  it("US-POK-10 with a tree shows N / M (P %) and k of K orders, K taken from the tree", () => {
    const p = collectorProgress(30, { speciesTotal: 600, orderTotal: 42, ordersDiscovered: 7 });
    expect(p.treeState).toBe("built");
    expect(p.species).toEqual({ caught: 30, total: 600, percent: 5 });
    expect(p.orders).toEqual({ discovered: 7, total: 42 });
  });

  it("US-POK-10 rounds the percentage to a whole number", () => {
    const p = collectorProgress(1, { speciesTotal: 3, orderTotal: 1, ordersDiscovered: 1 });
    expect(p.species.percent).toBe(33);
  });

  it("US-POK-10 without a tree total, percent and orders stay unknown, never invented (P-08)", () => {
    const p = collectorProgress(8, null);
    expect(p.treeState).toBe("missing");
    expect(p.species).toEqual({ caught: 8, total: null, percent: null });
    expect(p.orders).toEqual({ discovered: null, total: null });
  });

  it("US-POK-10 an empty tree (0 species) gives no percentage instead of dividing by zero", () => {
    const p = collectorProgress(0, { speciesTotal: 0, orderTotal: 0, ordersDiscovered: 0 });
    expect(p.species.percent).toBeNull();
  });
});
