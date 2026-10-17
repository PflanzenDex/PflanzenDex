import { describe, expect, it } from "vitest";
import { catalogList } from "./list";
import { speciesPropose } from "./species";
import { FULL, ReviewWorld } from "./test-helpers";

describe("US-BES-10 review list", () => {
  it("US-BES-10 shows open proposals with required-field issues, similar species, count and oldest date", async () => {
    const w = new ReviewWorld();
    await w.approvedSpecies({
      ...FULL,
      latinName: "Sansevieria cylindrica 'Skyline'",
      synonyms: [],
    });
    const a = await w.proposeSpecies("keeper");
    const b = await w.proposeSpecies("other", {
      ...FULL,
      latinName: "Sansevieria cylindrica",
      synonyms: [],
      source: undefined,
    });
    const r = await catalogList(w.reviews, w.species, "reviewer");
    if (!r.ok) throw new Error(r.error.code);
    expect(r.value.open).toBe(2);
    expect(r.value.oldestOpenAt).toBe(w.reviews.rows.find((z) => z.id === a.caseId)?.createdAt);
    const open = r.value.entries.filter((e) => e.reviewCase.status === "proposal");
    const first = open.find((e) => e.reviewCase.id === a.caseId);
    const second = open.find((e) => e.reviewCase.id === b.caseId);
    expect(first?.issues).toEqual([]);
    expect(first?.similar).toEqual([]);
    expect(second?.issues).toEqual([{ field: "source", reason: "source_missing" }]);
    expect(second?.similar.map((s) => s.latinName)).toEqual(["Sansevieria cylindrica 'Skyline'"]);
    expect(second?.species?.latinName).toBe("Sansevieria cylindrica");
  });

  it("US-BES-10 AI-created proposals are marked (FR-BES-06)", async () => {
    const w = new ReviewWorld();
    const p = await w.proposeSpecies("keeper");
    const row = w.reviews.rows.find((z) => z.id === p.caseId);
    if (row) w.reviews.rows[w.reviews.rows.indexOf(row)] = { ...row, status: "ai_unreviewed" };
    const r = await catalogList(w.reviews, w.species, "operator");
    expect(r.ok && r.value.entries.map((e) => e.aiCreated)).toEqual([true]);
  });

  it("US-BES-10 operator batches are listed, marked curated, not counted as open and without approval issues", async () => {
    const w = new ReviewWorld();
    const sp = await w.call(speciesPropose(w.species), "operator", { ...FULL, source: undefined });
    if (!sp.ok) throw new Error(sp.error.code);
    await w.reviews.create("operator", {
      objectKind: "species",
      objectId: sp.value.id,
      status: "curated",
    });
    const r = await catalogList(w.reviews, w.species, "operator");
    if (!r.ok) throw new Error(r.error.code);
    expect(r.value.open).toBe(0);
    expect(r.value.entries).toHaveLength(1);
    expect(r.value.entries[0]).toMatchObject({ issues: [], similar: [], aiCreated: false });
    expect(r.value.entries[0]?.reviewCase.status).toBe("curated");
  });

  it("US-BES-10 an entry of another kind has no species content", async () => {
    const w = new ReviewWorld();
    await w.reviews.create("keeper", {
      objectKind: "label",
      objectId: "6f1c2f0e-4b8a-4c52-9d51-0a3f6f2c7e11",
      status: "proposal",
    });
    const r = await catalogList(w.reviews, w.species, "operator");
    expect(r.ok && r.value.entries[0]?.species).toBeNull();
  });

  it("US-BES-10 P-04 a plant keeper (or a signed-out caller) cannot list proposals of others", async () => {
    const w = new ReviewWorld();
    await w.proposeSpecies("keeper");
    const denied = await catalogList(w.reviews, w.species, "other");
    expect(!denied.ok && denied.error.code).toBe("access.denied");
    const own = await catalogList(w.reviews, w.species, "keeper");
    expect(!own.ok && own.error.code).toBe("access.denied");
    const anonymous = await catalogList(w.reviews, w.species, null);
    expect(!anonymous.ok && anonymous.error.code).toBe("access.not_signed_in");
  });

  it("US-BES-10 an empty list has no open proposals and no oldest date", async () => {
    const w = new ReviewWorld();
    const r = await catalogList(w.reviews, w.species, "operator");
    expect(r.ok && r.value).toEqual({ open: 0, oldestOpenAt: null, entries: [] });
  });
});
