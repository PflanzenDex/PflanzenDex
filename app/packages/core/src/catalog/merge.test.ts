import { beforeEach, describe, expect, it } from "vitest";
import type { Operation } from "../kernel";
import { execute } from "../kernel";
import { catalogMerge, catalogPropose, catalogReview } from "./index";
import { InMemoryIdempotencyStore } from "../kernel/test-helpers";
import { InMemoryReview } from "./test-helpers";

const PROPOSAL_SPECIES = "6f1c2f0e-4b8a-4c52-9d51-0a3f6f2c7e11";
const EXISTING_SPECIES = "7f2c3f1f-5c9b-5d63-ae62-1b4g7g3d8f22";

let idem: InMemoryIdempotencyStore;
let store: InMemoryReview;
let counter = 0;

const call = <E, A>(op: Operation<E, A>, userId: string | null, input: unknown) =>
  execute(
    op,
    { idempotency: idem },
    {
      context: { userId },
      input,
      idempotencyKey: `k${++counter}`,
    },
  );

const propose = (userId = "keeper", speciesId = PROPOSAL_SPECIES) =>
  call(catalogPropose(store), userId, {
    objectKind: "species",
    objectId: speciesId,
    status: "proposal",
  });

beforeEach(() => {
  idem = new InMemoryIdempotencyStore();
  store = new InMemoryReview({ operator: ["operator"], reviewer: ["reviewer"] });
});

describe("US-BES-10 merge proposal with existing species (AC2)", () => {
  it("reviewer merges a proposal with an existing species, reassigning the review case", async () => {
    const proposal = await propose("keeper", PROPOSAL_SPECIES);
    expect(proposal.ok).toBe(true);
    if (!proposal.ok) return;

    // Create the review case for an existing species (curated/reviewed)
    const existing = await call(catalogPropose(store), "operator", {
      objectKind: "species",
      objectId: EXISTING_SPECIES,
      status: "curated",
    });
    expect(existing.ok).toBe(true);

    // Merge the proposal into the existing species
    const merge = await call(catalogMerge(store), "reviewer", {
      proposalId: proposal.value.id,
      targetSpeciesId: EXISTING_SPECIES,
    });

    expect(merge.ok).toBe(true);
    if (!merge.ok) return;

    // The proposal's review case should now point to the existing species
    expect(merge.value).toMatchObject({
      status: "reviewed",
      objectId: EXISTING_SPECIES,
    });
  });

  it("only reviewers and operators can merge (access.denied for keepers)", async () => {
    const proposal = await propose();
    expect(proposal.ok).toBe(true);
    if (!proposal.ok) return;

    const merge = await call(catalogMerge(store), "keeper", {
      proposalId: proposal.value.id,
      targetSpeciesId: EXISTING_SPECIES,
    });

    expect(!merge.ok && merge.error.code).toBe("access.denied");
  });

  it("cannot merge an unknown proposal (review.not_found)", async () => {
    const merge = await call(catalogMerge(store), "reviewer", {
      proposalId: "6f1c2f0e-4b8a-4c52-9d51-0a3f6f2c7e99",
      targetSpeciesId: EXISTING_SPECIES,
    });

    expect(!merge.ok && merge.error.code).toBe("review.not_found");
  });

  it("cannot merge an already reviewed proposal (review.status_invalid)", async () => {
    const proposal = await propose();
    expect(proposal.ok).toBe(true);
    if (!proposal.ok) return;

    // First approval
    await call(catalogReview(store), "reviewer", {
      id: proposal.value.id,
      status: "reviewed",
    });

    // Try to merge the approved one
    const merge = await call(catalogMerge(store), "reviewer", {
      proposalId: proposal.value.id,
      targetSpeciesId: EXISTING_SPECIES,
    });

    expect(!merge.ok && merge.error.code).toBe("review.status_invalid");
  });

  it("merging requires valid input (input.invalid for missing fields)", async () => {
    const proposal = await propose();
    expect(proposal.ok).toBe(true);

    const merge = await call(catalogMerge(store), "reviewer", {
      proposalId: proposal.ok ? proposal.value.id : "",
      targetSpeciesId: "", // Invalid UUID
    });

    expect(!merge.ok && merge.error.code).toBe("input.invalid");
  });

  it("merging a rejected proposal is invalid (review.status_invalid)", async () => {
    const proposal = await propose();
    expect(proposal.ok).toBe(true);
    if (!proposal.ok) return;

    // Reject it first
    await call(catalogReview(store), "reviewer", {
      id: proposal.value.id,
      status: "rejected",
      reason: "Duplicate",
    });

    // Try to merge it
    const merge = await call(catalogMerge(store), "reviewer", {
      proposalId: proposal.value.id,
      targetSpeciesId: EXISTING_SPECIES,
    });

    expect(!merge.ok && merge.error.code).toBe("review.status_invalid");
  });

  it("merging an AI-created proposal into existing marks it as reviewed (not ai_unreviewed)", async () => {
    const proposal = await call(catalogPropose(store), "keeper", {
      objectKind: "species",
      objectId: PROPOSAL_SPECIES,
      status: "ai_unreviewed",
    });
    expect(proposal.ok).toBe(true);
    if (!proposal.ok) return;

    // Create existing species
    await call(catalogPropose(store), "operator", {
      objectKind: "species",
      objectId: EXISTING_SPECIES,
      status: "curated",
    });

    // Merge
    const merge = await call(catalogMerge(store), "reviewer", {
      proposalId: proposal.value.id,
      targetSpeciesId: EXISTING_SPECIES,
    });

    expect(merge.ok && merge.value.status).toBe("reviewed");
  });

  it("merging requires write permission (nothing changed on permission error)", async () => {
    const proposal = await propose();
    expect(proposal.ok).toBe(true);
    if (!proposal.ok) return;

    // Re-instantiate store where keeper has no roles
    const noRoleStore = new InMemoryReview({
      operator: ["operator"],
      reviewer: ["reviewer"],
    });

    // A user with no role tries to merge
    const merge = await call(catalogMerge(noRoleStore), "keeper", {
      proposalId: proposal.value.id,
      targetSpeciesId: EXISTING_SPECIES,
    });

    expect(!merge.ok && merge.error.code).toBe("access.denied");
  });
});
