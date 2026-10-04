import { describe, expect, it } from "vitest";
import { catalogMerge } from "./merge";
import { FULL, ReviewWorld } from "./test-helpers";

const setup = async () => {
  const w = new ReviewWorld();
  const target = await w.approvedSpecies({
    ...FULL,
    latinName: "Sansevieria cylindrica",
    synonyms: [],
  });
  const proposal = await w.proposeSpecies("keeper");
  const merge = (user: string | null, input: Record<string, unknown>) =>
    w.call(catalogMerge(w.reviews, w.species), user, input);
  return { w, target, proposal, merge };
};

describe("US-BES-10 merge with an existing species (FR-BES-11, P-10)", () => {
  it.each(["operator", "reviewer"])(
    "US-BES-10 %s merges; the outcome tells what moved",
    async (role) => {
      const { w, target, proposal, merge } = await setup();
      w.reviews.moved = [
        { kind: "specimen", moved: 2, kept: 0 },
        { kind: "care_profile", moved: 0, kept: 1 },
      ];
      const r = await merge(role, {
        proposalId: proposal.caseId,
        targetSpeciesId: target.speciesId,
      });
      if (!r.ok) throw new Error(r.error.code);
      expect(r.value.reviewCase).toMatchObject({
        status: "merged",
        mergedInto: target.speciesId,
        reviewedBy: role,
      });
      expect(r.value.moved).toEqual(w.reviews.moved);
    },
  );

  it("US-BES-10 P-04 only reviewers merge: the creator and others get access.denied, nothing changes", async () => {
    const { w, target, proposal, merge } = await setup();
    for (const user of ["keeper", "other"]) {
      const r = await merge(user, {
        proposalId: proposal.caseId,
        targetSpeciesId: target.speciesId,
      });
      expect(!r.ok && r.error.code).toBe("access.denied");
    }
    const anonymous = await merge(null, {
      proposalId: proposal.caseId,
      targetSpeciesId: target.speciesId,
    });
    expect(!anonymous.ok && anonymous.error.code).toBe("access.not_signed_in");
    expect(w.reviews.rows.find((z) => z.id === proposal.caseId)?.status).toBe("proposal");
  });

  it("US-BES-10 the target must exist, be approved and not be the proposal itself", async () => {
    const { w, proposal, merge } = await setup();
    const other = await w.proposeSpecies("other", {
      ...FULL,
      latinName: "Ficus lyrata",
      synonyms: [],
    });
    for (const targetSpeciesId of [
      proposal.speciesId,
      other.speciesId,
      "6f1c2f0e-4b8a-4c52-9d51-0a3f6f2c7e99",
    ]) {
      const r = await merge("reviewer", { proposalId: proposal.caseId, targetSpeciesId });
      expect(!r.ok && r.error.code).toBe("review.merge_target_invalid");
    }
    expect(w.reviews.rows.find((z) => z.id === proposal.caseId)?.status).toBe("proposal");
  });

  it("US-BES-10 an unknown case is not found; a decided case cannot be merged", async () => {
    const { target, proposal, merge } = await setup();
    const missing = await merge("reviewer", {
      proposalId: "6f1c2f0e-4b8a-4c52-9d51-0a3f6f2c7e99",
      targetSpeciesId: target.speciesId,
    });
    expect(!missing.ok && missing.error.code).toBe("review.not_found");
    await merge("reviewer", { proposalId: proposal.caseId, targetSpeciesId: target.speciesId });
    const again = await merge("reviewer", {
      proposalId: proposal.caseId,
      targetSpeciesId: target.speciesId,
    });
    expect(!again.ok && again.error.code).toBe("review.status_invalid");
  });

  it("US-BES-10 only species proposals can be merged", async () => {
    const { w, target, merge } = await setup();
    const label = await w.reviews.create("keeper", {
      objectKind: "label",
      objectId: "6f1c2f0e-4b8a-4c52-9d51-0a3f6f2c7e11",
      status: "proposal",
    });
    const id = typeof label === "string" ? "" : label.id;
    const r = await merge("reviewer", { proposalId: id, targetSpeciesId: target.speciesId });
    expect(!r.ok && r.error.code).toBe("review.not_found");
  });

  it("US-BES-10 a conflict in the re-pointing is reported and nothing is merged", async () => {
    const { w, target, proposal, merge } = await setup();
    w.reviews.conflict = true;
    const r = await merge("reviewer", {
      proposalId: proposal.caseId,
      targetSpeciesId: target.speciesId,
    });
    expect(!r.ok && r.error.code).toBe("review.merge_conflict");
    expect(w.reviews.rows.find((z) => z.id === proposal.caseId)?.status).toBe("proposal");
  });

  it("US-BES-10 a case that is decided while merging is reported as decided", async () => {
    const { w, target, proposal, merge } = await setup();
    const original = w.reviews.merge.bind(w.reviews);
    w.reviews.merge = async () => null;
    const r = await merge("reviewer", {
      proposalId: proposal.caseId,
      targetSpeciesId: target.speciesId,
    });
    expect(!r.ok && r.error.code).toBe("review.status_invalid");
    w.reviews.merge = original;
  });

  it("US-BES-10 input is validated (ids)", async () => {
    const { merge } = await setup();
    const r = await merge("reviewer", { proposalId: "x", targetSpeciesId: "" });
    expect(!r.ok && r.error.details?.map((d) => d.field)).toEqual([
      "proposalId",
      "targetSpeciesId",
    ]);
  });
});
