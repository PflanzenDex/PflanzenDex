import { describe, expect, it } from "vitest";
import type { AttributeFact } from "../attributes";
import { deriveGrowthSize, orderAttributeFill, runAttributeFill } from "./index";
import type { AttributeFillStore, HeightCandidate } from "./index";

// US-ENT-09 part 2, P-08: the attribute fill turns cited heights into growth sizes; nothing without evidence.
const claim = (amount: string, unit = "Q11573", rank = "normal") => ({
  rank,
  mainsnak: {
    snaktype: "value",
    datavalue: { value: { amount, unit: `http://www.wikidata.org/entity/${unit}` } },
  },
});
const candidate = (
  heightClaims: unknown,
  over: Partial<HeightCandidate> = {},
): HeightCandidate => ({
  latinName: "Zz fillus",
  itemId: "Q42",
  heightClaims,
  retrievedAt: "2026-10-18",
  license: "CC0-1.0",
  ...over,
});

function memory(candidates: HeightCandidate[]) {
  const saved: AttributeFact[] = [];
  const store: AttributeFillStore = {
    heightCandidates: async () =>
      candidates.filter((c) => !saved.some((f) => f.species === c.latinName)),
    save: async (facts) => void saved.push(...facts),
  };
  return { store, saved };
}

describe("US-ENT-09 deriving the growth size from a cited height", () => {
  it("US-ENT-09 classes metres and centimetres and keeps the evidence of the Wikidata item", () => {
    expect(deriveGrowthSize(candidate([claim("+0.3")]))?.value).toBe("small");
    expect(deriveGrowthSize(candidate([claim("+90", "Q174728")]))?.value).toBe("medium");
    expect(deriveGrowthSize(candidate([claim("+12")]))?.value).toBe("large");
    expect(deriveGrowthSize(candidate([claim("+1.2")]))?.evidence).toEqual({
      source: "wikidata",
      url: "https://www.wikidata.org/wiki/Q42",
      license: "CC0-1.0",
      retrievedAt: "2026-10-18",
    });
  });

  it("US-ENT-09 leaves the field unknown without a usable claim, with a foreign unit or with a contradiction", () => {
    expect(deriveGrowthSize(candidate(undefined))).toBeNull();
    expect(deriveGrowthSize(candidate([]))).toBeNull();
    expect(deriveGrowthSize(candidate([claim("+3", "Q218593")]))).toBeNull(); // inch: not converted
    expect(deriveGrowthSize(candidate([claim("-1")]))).toBeNull();
    expect(deriveGrowthSize(candidate([claim("+3", "Q11573", "deprecated")]))).toBeNull();
    expect(deriveGrowthSize(candidate([claim("+0.2"), claim("+5")]))).toBeNull();
  });

  it("US-ENT-09 lets a preferred claim decide between differing ones", () => {
    const claims = [claim("+0.2"), claim("+5", "Q11573", "preferred")];
    expect(deriveGrowthSize(candidate(claims))?.value).toBe("large");
  });
});

describe("US-ENT-09 the attribute fill job", () => {
  it("US-ENT-09 stores only facts that pass the check and is repeatable", async () => {
    const { store, saved } = memory([
      candidate([claim("+0.3")]),
      candidate([claim("+3", "Q218593")], { latinName: "Zz unknownus" }),
    ]);
    expect(await runAttributeFill({ store })).toEqual({ stored: 1 });
    expect(saved.map((f) => [f.species, f.field, f.value])).toEqual([
      ["Zz fillus", "growthSize", "small"],
    ]);
    expect(await runAttributeFill({ store })).toEqual({ stored: 0 });
    expect(saved).toHaveLength(1);
  });

  it("US-ENT-09 refuses a fact whose license is not free, stores nothing for it and reports the problem (P-10)", async () => {
    const { store, saved } = memory([
      candidate([claim("+0.3")], { license: "CC-BY-NC-4.0" }),
      candidate([claim("+0.3")], { latinName: "Zz fine" }),
    ]);
    await expect(runAttributeFill({ store })).rejects.toThrow(
      "Zz fillus: attribute.license_missing",
    );
    expect(saved.map((f) => f.species)).toEqual(["Zz fine"]);
  });

  it("US-ENT-09 orders the job only when there is a candidate", async () => {
    const orders: string[][] = [];
    const order = async (type: string, key: string) => void orders.push([type, key]);
    expect(await orderAttributeFill({ store: memory([]).store, order })).toBe("up_to_date");
    expect(orders).toEqual([]);
    expect(await orderAttributeFill({ store: memory([candidate([])]).store, order })).toBe(
      "queued",
    );
    expect(orders).toEqual([["catalog.fill_attributes", "fill-attributes"]]);
  });
});
