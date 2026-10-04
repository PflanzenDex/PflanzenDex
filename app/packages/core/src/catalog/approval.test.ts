import { describe, expect, it } from "vitest";
import { checkApprovalReadiness } from "./approval";
import { catalogReview } from "./review";
import { FULL, ReviewWorld } from "./test-helpers";
import type { SpeciesValues } from "./species";

const base: SpeciesValues = {
  latinName: "Dracaena trifasciata",
  genus: "Dracaena",
  epithet: "trifasciata",
  cultivar: null,
  germanName: null,
  englishName: null,
  synonyms: [],
  familyGerman: null,
  familyLatin: null,
  difficulty: 1,
  standardLevel: 2,
  lightDemandLux: 15000,
  dormancyFrom: null,
  dormancyUntil: null,
  locationHint: null,
  growthMeasure: "height",
  etiolationSigns: "schmal",
  wateringHint: null,
  substrate: null,
  pruning: null,
  growthHacks: null,
  successCriteria: "aufrecht",
  botanicalStory: null,
  source: "RHS",
};

describe("US-BES-10 approval readiness (FR-BES-05, FR-BES-14)", () => {
  it("US-BES-10 a complete profile with a source is ready", () => {
    expect(checkApprovalReadiness(base)).toEqual([]);
  });

  it("US-BES-10 blank required texts are named one by one", () => {
    const issues = checkApprovalReadiness({
      ...base,
      latinName: " ",
      etiolationSigns: "",
      successCriteria: " ",
      growthMeasure: "" as never,
    });
    expect(issues.map((i) => i.field)).toEqual([
      "latinName",
      "growthMeasure",
      "etiolationSigns",
      "successCriteria",
    ]);
    expect(issues.every((i) => i.reason === "missing")).toBe(true);
  });

  it("US-BES-10 a missing number is reported", () => {
    const issues = checkApprovalReadiness({ ...base, lightDemandLux: Number.NaN });
    expect(issues).toContainEqual({ field: "lightDemandLux", reason: "missing" });
  });

  it("US-BES-10 without a source for the light demand it is not ready", () => {
    expect(checkApprovalReadiness({ ...base, source: null })).toEqual([
      { field: "source", reason: "source_missing" },
    ]);
    expect(checkApprovalReadiness({ ...base, source: "  " })).toEqual([
      { field: "source", reason: "source_missing" },
    ]);
  });

  it("US-BES-10 a dormancy period needs the source as well", () => {
    const issues = checkApprovalReadiness({
      ...base,
      lightDemandLux: Number.NaN,
      dormancyFrom: "11-01",
      dormancyUntil: "02-15",
      source: null,
    });
    expect(issues.map((i) => i.field)).toEqual(["lightDemandLux", "source"]);
  });
});

describe("US-BES-10 approve operation checks readiness (P-03)", () => {
  it("US-BES-10 approving a proposal without a source is refused and names the field; nothing changes", async () => {
    const w = new ReviewWorld();
    const p = await w.proposeSpecies("keeper", { ...FULL, source: undefined });
    const r = await w.call(catalogReview(w.reviews, w.species), "reviewer", {
      id: p.caseId,
      status: "reviewed",
    });
    expect(!r.ok && r.error.code).toBe("review.approval_incomplete");
    expect(!r.ok && r.error.details).toEqual([{ field: "source", code: "input.invalid" }]);
    expect(w.reviews.rows[0]?.status).toBe("proposal");
  });

  it("US-BES-10 a complete proposal is approved, reviewer recorded", async () => {
    const w = new ReviewWorld();
    const p = await w.proposeSpecies("keeper");
    const r = await w.call(catalogReview(w.reviews, w.species), "reviewer", {
      id: p.caseId,
      status: "reviewed",
    });
    expect(r.ok && r.value).toMatchObject({ status: "reviewed", reviewedBy: "reviewer" });
  });

  it("US-BES-10 rejecting needs no readiness (an incomplete proposal can be rejected with a reason)", async () => {
    const w = new ReviewWorld();
    const p = await w.proposeSpecies("keeper", { ...FULL, source: undefined });
    const r = await w.call(catalogReview(w.reviews, w.species), "reviewer", {
      id: p.caseId,
      status: "rejected",
      reason: "Quelle fehlt",
    });
    expect(r.ok && r.value).toMatchObject({ status: "rejected", reason: "Quelle fehlt" });
  });

  it("US-BES-10 a case whose species content is gone cannot be approved (review.not_found)", async () => {
    const w = new ReviewWorld();
    const p = await w.proposeSpecies("keeper");
    w.species.rows.length = 0;
    const r = await w.call(catalogReview(w.reviews, w.species), "reviewer", {
      id: p.caseId,
      status: "reviewed",
    });
    expect(!r.ok && r.error.code).toBe("review.not_found");
  });

  it("US-BES-10 FR-BES-06 an account without reviewer role (an AI connection has none) can never approve", async () => {
    const w = new ReviewWorld();
    const p = await w.proposeSpecies("keeper");
    for (const user of ["keeper", "ai-connection-account"]) {
      const r = await w.call(catalogReview(w.reviews, w.species), user, {
        id: p.caseId,
        status: "reviewed",
      });
      expect(!r.ok && r.error.code).toBe("access.denied");
    }
    expect(w.reviews.rows[0]?.status).toBe("proposal");
  });
});
