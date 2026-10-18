import { describe, expect, it } from "vitest";
import { GAP_FIELDS, buildGapList, catalogGaps, type GapSpecies, type GapStore } from "./gaps";
import { InMemoryReview } from "../test-helpers";

const known = Object.fromEntries(GAP_FIELDS.map((f) => [f, "x"])) as GapSpecies["values"];
const species = (over: Partial<GapSpecies> & { id: string }): GapSpecies => ({
  latinName: `Plantus ${over.id}`,
  values: known,
  checks: [],
  ...over,
});

describe("US-BES-13 gap list", () => {
  it("US-BES-13 lists unknown fields per species and leaves out complete species", () => {
    const list = buildGapList([
      species({ id: "a", values: { ...known, substrate: null, germanName: null } }),
      species({ id: "b" }),
    ]);
    expect(list.species).toBe(1);
    expect(list.gaps).toBe(2);
    expect(list.entries[0]?.gaps.map((g) => g.field)).toEqual(["germanName", "substrate"]);
  });

  it("US-BES-13 names the source and time of the last check, or null when none was asked (P-08)", () => {
    const list = buildGapList([
      species({
        id: "a",
        values: { ...known, substrate: null },
        checks: [
          { source: "gbif", retrievedAt: "2026-10-01T08:00:00Z" },
          { source: "wikipedia", retrievedAt: "2026-10-05T08:00:00Z" },
        ],
      }),
      species({ id: "b", values: { ...known, substrate: null } }),
    ]);
    expect(list.entries[0]?.lastCheck).toEqual({
      source: "wikipedia",
      retrievedAt: "2026-10-05T08:00:00Z",
    });
    expect(list.entries[1]?.lastCheck).toBeNull();
  });

  it("US-BES-13 gives every gap a next step: fill job while sources are unasked, else research (P-09)", () => {
    const both = [
      { source: "gbif", retrievedAt: "2026-10-01T08:00:00Z" },
      { source: "wikipedia", retrievedAt: "2026-10-01T08:00:00Z" },
    ] as const;
    const list = buildGapList([
      species({ id: "a", values: { ...known, germanName: null, substrate: null } }),
      species({ id: "b", values: { ...known, germanName: null, substrate: null }, checks: both }),
    ]);
    const step = (i: number, f: string) =>
      list.entries[i]?.gaps.find((g) => g.field === f)?.nextStep;
    expect(step(0, "germanName")).toBe("fill_job");
    expect(step(0, "substrate")).toBe("research");
    expect(step(1, "germanName")).toBe("research");
  });

  it("US-BES-13 shows the gap list to operators and reviewers only (shared catalog, P-04)", async () => {
    const store: GapStore = {
      approvedSpecies: async () => [species({ id: "a", values: { ...known, pruning: null } })],
    };
    const roles = new InMemoryReview({ operator: ["operator"] });
    const ok = await catalogGaps(store, roles, "operator");
    expect(ok.ok && ok.value.gaps).toBe(1);
    const keeper = await catalogGaps(store, roles, "keeper");
    expect(!keeper.ok && keeper.error.code).toBe("access.denied");
    const anon = await catalogGaps(store, roles, null);
    expect(!anon.ok && anon.error.code).toBe("access.not_signed_in");
  });
});
