import { describe, expect, it } from "vitest";
import { milestoneOverview, milestones, type MilestoneTree, type TreeGroup } from "./milestones";

const sp = (latin: string, german: string | null = null) => ({ latin, german });
const group = (name: string, species: string[], german: string | null = null): TreeGroup => ({
  name,
  german,
  species: species.map((s) => sp(s, `${s} de`)),
});

const tree: MilestoneTree = {
  families: [
    group("Cactaceae", ["A a", "A b", "A c", "A d", "A e"]),
    group("Araceae", ["B a", "B b"]),
    group("Solo", ["C a"]),
  ],
  genera: [group("A", ["A a", "A b"]), group("C", ["C a"])],
  orders: [
    group("Caryophyllales", ["A a", "A b", "A c", "A d", "A e"]),
    group("Alismatales", ["B a", "B b", "C a"]),
  ],
};

const caught = (...pairs: [string, string | null][]) =>
  new Map(pairs.map(([species, date]) => [species, date]));
const find = (list: ReturnType<typeof milestones>, id: string) => list.find((m) => m.id === id);

describe("US-POK-11 milestones with an instruction for action", () => {
  it("US-POK-11 a family has discovered (>= 1), connoisseur (>= 3 species, half rounded up) and complete (>= 2, all)", () => {
    const list = milestones(tree, caught(["A a", "2026-01-02"]));
    expect(find(list, "family:Cactaceae:discovered")).toMatchObject({
      current: 1,
      target: 1,
      remaining: 0,
    });
    expect(find(list, "family:Cactaceae:connoisseur")).toMatchObject({
      current: 1,
      target: 3,
      remaining: 2,
    });
    expect(find(list, "family:Cactaceae:complete")).toMatchObject({
      current: 1,
      target: 5,
      remaining: 4,
    });
    expect(find(list, "family:Araceae:connoisseur")).toBeUndefined(); // only 2 species
    expect(find(list, "family:Araceae:complete")).toMatchObject({ target: 2 });
    expect(find(list, "family:Solo:complete")).toBeUndefined(); // only 1 species
    expect(find(list, "family:Solo:discovered")).toMatchObject({ target: 1, remaining: 1 });
  });

  it("US-POK-11 a genus has discovered and complete (>= 2 species) but no connoisseur", () => {
    const list = milestones(tree, caught());
    expect(find(list, "genus:A:discovered")).toBeDefined();
    expect(find(list, "genus:A:complete")).toMatchObject({ target: 2 });
    expect(find(list, "genus:A:connoisseur")).toBeUndefined();
    expect(find(list, "genus:C:complete")).toBeUndefined();
  });

  it("US-POK-11 explorer counts orders with a caught species; missing lists the orders with the fewest species first", () => {
    const e = find(milestones(tree, caught(["A a", null])), "explorer");
    expect(e).toMatchObject({ current: 1, target: 2, remaining: 1 });
    expect(e?.missing).toEqual([{ latin: "Alismatales", german: null }]);
    const none = find(milestones(tree, caught()), "explorer");
    expect(none?.missing.map((m) => m.latin)).toEqual(["Alismatales", "Caryophyllales"]);
  });

  it("US-POK-11 every milestone has up to 3 missing species with German and Latin name", () => {
    const m = find(milestones(tree, caught(["A a", null])), "family:Cactaceae:complete");
    expect(m?.missing).toEqual([
      { latin: "A b", german: "A b de" },
      { latin: "A c", german: "A c de" },
      { latin: "A d", german: "A d de" },
    ]);
  });

  it("US-POK-11 species outside every family, genus or order produce no milestones", () => {
    const list = milestones(tree, caught(["Unbekannt x", "2026-01-01"]));
    expect(list.every((m) => !m.id.includes("Unbekannt"))).toBe(true);
    expect(find(list, "family:Cactaceae:discovered")?.current).toBe(0);
  });

  it("US-POK-11 the date of a reached milestone is the catch date of the nth species, null if not known (P-08)", () => {
    const dated = milestones(
      tree,
      caught(["A a", "2026-03-01"], ["A b", "2026-01-05"], ["A c", "2026-02-01"]),
    );
    expect(find(dated, "family:Cactaceae:connoisseur")?.reachedOn).toBe("2026-03-01");
    expect(find(dated, "family:Cactaceae:discovered")?.reachedOn).toBe("2026-01-05");
    const unknown = milestones(tree, caught(["A a", "2026-03-01"], ["A b", null]));
    expect(find(unknown, "genus:A:complete")?.reachedOn).toBeNull();
    expect(find(unknown, "family:Cactaceae:connoisseur")?.reachedOn).toBeNull(); // not reached
  });

  it("US-POK-11 shows up to 4 open milestones: smallest remainder > 0, then higher ratio, then title", () => {
    const { open, reached } = milestoneOverview(
      milestones(tree, caught(["A a", "2026-01-01"], ["B a", "2026-01-02"])),
    );
    expect(open).toHaveLength(4);
    expect(open.every((m) => m.remaining > 0)).toBe(true);
    const sorted = open.every((m, i) => {
      const p = open[i - 1];
      if (!p) return true;
      return (
        p.remaining < m.remaining ||
        (p.remaining === m.remaining && p.current / p.target >= m.current / m.target)
      );
    });
    expect(sorted).toBe(true);
    expect(reached.every((m) => m.remaining === 0)).toBe(true);
    expect(reached.map((m) => m.id)).toContain("family:Cactaceae:discovered");
  });

  it("US-POK-11 breaks a tie of remainder and ratio by title", () => {
    const t: MilestoneTree = {
      families: [group("Zeta", ["z1", "z2"]), group("Alfa", ["a1", "a2"])],
      genera: [],
      orders: [],
    };
    const { open } = milestoneOverview(milestones(t, caught()));
    expect(open.slice(0, 2).map((m) => m.title)).toEqual(["Alfa", "Zeta"]);
  });
});
