import { describe, expect, it } from "vitest";
import type { Species } from "../../catalog";
import { appRarityOf, readAppRarityBasis, type RarityDependencies } from "./rarity";

// US-POK-14: the share of participating accounts that own a species; in-memory ports.
const species = (latinName: string) => ({ latinName }) as Species;
const deps = (
  participants: string[],
  owned: [string, string][],
  names: Record<string, string>,
): RarityDependencies & { asked: string[][] } => {
  const asked: string[][] = [];
  return {
    asked,
    participants: { rarityParticipants: async () => participants },
    owned: {
      activeSpeciesOf: async (ids) => {
        asked.push([...ids]);
        return owned
          .filter(([a]) => ids.includes(a))
          .map(([accountId, speciesId]) => ({ accountId, speciesId }));
      },
    },
    species: {
      findMany: async (_u, ids) => ids.map((id) => (names[id] ? species(names[id]) : null)),
    },
  };
};
const names = { s1: "Ficus benjamina", s2: "Ficus benjamina 'Danielle'", s3: "Aloe vera" };

describe("US-POK-14 rarity in PflanzenDex", () => {
  it("US-POK-14 counts accounts, not specimens: a cultivar and its species count once per account", async () => {
    const d = deps(
      ["a", "b", "c", "d", "e"],
      [
        ["a", "s1"],
        ["a", "s2"],
        ["b", "s2"],
        ["c", "s3"],
      ],
      names,
    );
    const basis = await readAppRarityBasis(d, "viewer");
    expect(appRarityOf(basis, "Ficus benjamina")).toEqual({
      owners: 2,
      participants: 5,
      percent: 40,
    });
    expect(appRarityOf(basis, "Aloe vera")).toEqual({ owners: 1, participants: 5, percent: 20 });
  });

  it("US-POK-14 a species nobody owns is 0 of N, not unknown", async () => {
    const basis = await readAppRarityBasis(deps(["a", "b"], [], names), "viewer");
    expect(appRarityOf(basis, "Aloe vera")).toEqual({ owners: 0, participants: 2, percent: 0 });
  });

  it("US-POK-14 is unknown without participating accounts and asks nothing further", async () => {
    const d = deps([], [["a", "s1"]], names);
    const basis = await readAppRarityBasis(d, "viewer");
    expect(appRarityOf(basis, "Ficus benjamina")).toBeNull();
    expect(d.asked).toEqual([]);
  });

  it("US-POK-14 only asks for the participating accounts, so a non-participant never enters", async () => {
    const d = deps(
      ["a"],
      [
        ["a", "s3"],
        ["z", "s3"],
      ],
      names,
    );
    const basis = await readAppRarityBasis(d, "viewer");
    expect(d.asked).toEqual([["a"]]);
    expect(appRarityOf(basis, "Aloe vera")).toMatchObject({
      owners: 1,
      participants: 1,
      percent: 100,
    });
  });

  it("US-POK-14 ignores species the viewer cannot read and honest rounding keeps owners and participants", async () => {
    const basis = await readAppRarityBasis(
      deps(
        ["a", "b", "c"],
        [
          ["a", "hidden"],
          ["b", "s3"],
        ],
        names,
      ),
      "v",
    );
    expect(appRarityOf(basis, "Aloe vera")).toEqual({ owners: 1, participants: 3, percent: 33 });
  });

  it("US-POK-14 never carries account IDs in the result", async () => {
    const basis = await readAppRarityBasis(
      deps(["acct-secret"], [["acct-secret", "s3"]], names),
      "v",
    );
    expect(JSON.stringify(appRarityOf(basis, "Aloe vera"))).not.toContain("acct-secret");
  });
});
