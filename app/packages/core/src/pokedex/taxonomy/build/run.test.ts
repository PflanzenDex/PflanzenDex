import { describe, expect, it } from "vitest";
import { appError, failed } from "../../../kernel";
import type { SourceClient } from "../../../kernel";
import type { TaxonomyBuild, TaxonomyStore } from "../types";
import { TAXONOMY_JOB_TYPE, fingerprintOf, orderTaxonomyBuild, runTaxonomyBuild } from "./run";

const NOW = new Date("2026-10-06T10:00:00Z");
function memory(initial: string | null = null) {
  const state = { fingerprint: initial, replaced: [] as TaxonomyBuild[] };
  const store: TaxonomyStore = {
    async fingerprint() {
      return state.fingerprint;
    },
    async replace(build) {
      state.replaced.push(build);
      state.fingerprint = build.fingerprint;
    },
  };
  return { state, store };
}
const names = (...n: string[]) => ({ latinNames: async () => n });
const down: SourceClient = { get: async () => failed(appError("source.unavailable")) };
const noMatch: SourceClient = {
  get: async () => ({
    ok: true,
    value: {
      kind: "found",
      cached: false,
      data: { results: [] },
      provenance: { source: "opentree", url: "u", retrievedAt: NOW.toISOString() },
    },
  }),
};

describe("US-POK-03 build job", () => {
  it("US-POK-03 queues a build when the catalog differs from the tree, once per fingerprint", async () => {
    const { store } = memory(null);
    const ordered: [string, string][] = [];
    const order = async (t: string, k: string) => void ordered.push([t, k]);
    expect(await orderTaxonomyBuild({ names: names("Ficus benjamina"), store, order })).toBe(
      "queued",
    );
    expect(ordered).toEqual([[TAXONOMY_JOB_TYPE, fingerprintOf(["Ficus benjamina"])]]);
  });

  it("US-POK-03 queues nothing when the catalog is unchanged or empty", async () => {
    const { store } = memory(fingerprintOf(["Ficus benjamina"]));
    const order = async () => {
      throw new Error("must not run");
    };
    expect(await orderTaxonomyBuild({ names: names("Ficus benjamina"), store, order })).toBe(
      "up_to_date",
    );
    expect(await orderTaxonomyBuild({ names: names(), store, order })).toBe("empty");
  });

  it("US-POK-03 the fingerprint ignores order, spacing and duplicates but not content", () => {
    expect(fingerprintOf(["b b", "a a"])).toBe(fingerprintOf([" a  a", "b b", "a a"]));
    expect(fingerprintOf(["a a"])).not.toBe(fingerprintOf(["a b"]));
  });

  it("US-POK-03 a failed build throws with the code and keeps the previous tree", async () => {
    const { store, state } = memory("old");
    await expect(
      runTaxonomyBuild({ names: names("Ficus benjamina"), store, sources: down }, NOW),
    ).rejects.toThrow("source.unavailable");
    expect(state).toMatchObject({ fingerprint: "old", replaced: [] });
  });

  it("US-POK-03 stores the tree together with the error list in one replacement", async () => {
    const { store, state } = memory("old");
    await runTaxonomyBuild({ names: names("Nonexistus plantus"), store, sources: noMatch }, NOW);
    expect(state.replaced).toEqual([
      {
        fingerprint: fingerprintOf(["Nonexistus plantus"]),
        builtAt: NOW.toISOString(),
        taxa: [],
        failures: [{ latinName: "Nonexistus plantus", reason: "taxonomy.no_match" }],
      },
    ]);
  });

  it("US-POK-03 does nothing without a catalog change", async () => {
    const { store, state } = memory(fingerprintOf(["Ficus benjamina"]));
    await runTaxonomyBuild({ names: names("Ficus benjamina"), store, sources: down }, NOW);
    expect(state.replaced).toEqual([]);
  });
});
