import { beforeEach, describe, expect, it } from "vitest";
import type { Operation } from "../../kernel";
import { execute } from "../../kernel";
import { catalogCurate, catalogMerge, catalogReview, catalogPropose } from "../index";
import { InMemoryIdempotencyStore } from "../../kernel/test-helpers";
import { FULL, InMemoryReview, ReviewWorld } from "../test-helpers";
import { InMemorySpecies } from "../species/test-helpers";

const OBJECT = "6f1c2f0e-4b8a-4c52-9d51-0a3f6f2c7e11";
let idem: InMemoryIdempotencyStore;
let store: InMemoryReview;
let counter = 0;

// This file tests the generic mechanism with a kind that has no species content; the species rules
// (approval readiness, merge) are in approval.test.ts, merge.test.ts and list.test.ts.
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

const propose = (user = "keeper", extra: object = {}) =>
  call(catalogPropose(store), user, {
    objectKind: "label",
    objectId: OBJECT,
    status: "proposal",
    ...extra,
  });

beforeEach(() => {
  idem = new InMemoryIdempotencyStore();
  store = new InMemoryReview({ operator: ["operator"], reviewer: ["reviewer"] });
});

describe("FR-BES-02 users can only propose", () => {
  it("a plant keeper creates a proposal; it is assigned to them and unreviewed", async () => {
    const r = await propose();
    expect(r.ok && r.value).toMatchObject({
      creatorId: "keeper",
      status: "proposal",
      reviewedBy: null,
    });
  });

  it("AI-created is marked (FR-BES-06)", async () => {
    const r = await propose("keeper", { status: "ai_unreviewed" });
    expect(r.ok && r.value.status).toBe("ai_unreviewed");
  });

  it.each(["reviewed", "curated", "rejected", "irgendwas"])(
    "a user cannot create themselves as %s",
    async (status) => {
      const r = await propose("keeper", { status });
      expect(!r.ok && r.error.code).toBe("input.invalid");
      expect(store.rows).toHaveLength(0);
    },
  );

  it("requires sign-in and valid input", async () => {
    const r = await call(catalogPropose(store), null, {
      objectKind: "label",
      objectId: OBJECT,
      status: "proposal",
    });
    expect(!r.ok && r.error.code).toBe("access.not_signed_in");
    const s = await propose("keeper", { objectId: "no-uuid", objectKind: "Art!" });
    expect(!s.ok && s.error.details?.map((d) => d.field)).toEqual(["objectKind", "objectId"]);
  });

  it("proposing the same object twice fails with review.already_exists", async () => {
    await propose();
    const r = await propose("other");
    expect(!r.ok && r.error.code).toBe("review.already_exists");
  });
});

describe("FR-BES-14 only operators and reviewers set the review status", () => {
  const decide = (user: string, id: string, status = "reviewed", reason?: string) =>
    call(catalogReview(store, new InMemorySpecies()), user, { id, status, reason });

  it.each(["operator", "reviewer"])("%s approves; reviewer and time are recorded", async (role) => {
    const v = await propose();
    const id = v.ok ? v.value.id : "";
    const r = await decide(role, id);
    expect(r.ok && r.value).toMatchObject({ status: "reviewed", reviewedBy: role });
  });

  it("the creator and other users cannot approve (access.denied, nothing changed)", async () => {
    const v = await propose();
    const id = v.ok ? v.value.id : "";
    for (const user of ["keeper", "foreign"]) {
      const r = await decide(user, id);
      expect(!r.ok && r.error.code).toBe("access.denied");
    }
    expect(store.rows[0]?.status).toBe("proposal");
  });

  it("rejecting requires a reason; otherwise the proposal stays unchanged", async () => {
    const v = await propose();
    const id = v.ok ? v.value.id : "";
    const without = await decide("operator", id, "rejected");
    expect(!without.ok && without.error.code).toBe("review.reason_missing");
    const using = await decide("operator", id, "rejected", "Source for light demand missing");
    expect(using.ok && using.value).toMatchObject({
      status: "rejected",
      reason: "Source for light demand missing",
    });
  });

  it("only open proposals can be decided; an unknown case is not found", async () => {
    const v = await propose();
    const id = v.ok ? v.value.id : "";
    await decide("operator", id);
    const again = await decide("operator", id, "rejected", "too late");
    expect(!again.ok && again.error.code).toBe("review.status_invalid");
    const missing = await decide("operator", "6f1c2f0e-4b8a-4c52-9d51-0a3f6f2c7e99");
    expect(!missing.ok && missing.error.code).toBe("review.not_found");
  });

  it("an approval cannot be reset to `proposal` (status only reviewed or rejected)", async () => {
    const r = await decide("operator", OBJECT, "proposal");
    expect(!r.ok && r.error.code).toBe("input.invalid");
  });

  it("curating (operator batch) is for reviewers only and immediately yields `curated`", async () => {
    const fresh = { objectKind: "label", objectId: OBJECT };
    const no = await call(catalogCurate(store), "keeper", fresh);
    expect(!no.ok && no.error.code).toBe("access.denied");
    const yes = await call(catalogCurate(store), "operator", fresh);
    expect(yes.ok && yes.value).toMatchObject({ status: "curated", reviewedBy: "operator" });
  });
});

describe("US-BES-10 approval refuses a Latin name that an approved species already has", () => {
  const TWIN = { ...FULL, synonyms: [] };
  const approve = (w: ReviewWorld, caseId: string) =>
    w.call(catalogReview(w.reviews, w.species), "operator", { id: caseId, status: "reviewed" });

  it("US-BES-10 a proposal whose Latin name an approved species has is refused with review.name_approved, naming it; nothing changes", async () => {
    const w = new ReviewWorld();
    const proposal = await w.proposeSpecies("keeper", TWIN);
    const twin = await w.approvedSpecies(TWIN);
    const r = await approve(w, proposal.caseId);
    expect(!r.ok && r.error.code).toBe("review.name_approved");
    expect(!r.ok && r.error.data).toEqual({
      existing: { id: twin.speciesId, latinName: "Dracaena trifasciata" },
    });
    expect(w.reviews.rows.find((z) => z.id === proposal.caseId)?.status).toBe("proposal");
    expect(w.species.rows.find((z) => z.id === proposal.speciesId)?.reviewStatus).toBe("proposal");
  });

  it.each(["DRACAENA TRIFASCIATA", "Dracaëna trifasciata"])(
    "US-BES-10 the same name in another case or with an accent (%s) is refused too",
    async (variant) => {
      const w = new ReviewWorld();
      const proposal = await w.proposeSpecies("keeper", { ...TWIN, latinName: variant });
      await w.approvedSpecies(TWIN);
      const r = await approve(w, proposal.caseId);
      expect(!r.ok && r.error.code).toBe("review.name_approved");
    },
  );

  it("US-BES-10 a free Latin name is approved as before", async () => {
    const w = new ReviewWorld();
    await w.approvedSpecies(TWIN);
    const proposal = await w.proposeSpecies("keeper", { ...TWIN, latinName: "Aloe vera" });
    const r = await approve(w, proposal.caseId);
    expect(r.ok && r.value).toMatchObject({ status: "reviewed" });
  });

  it("US-BES-10 a name equal only to a synonym of an approved species is approved; the synonym stays a hint", async () => {
    const w = new ReviewWorld();
    const proposal = await w.proposeSpecies("keeper", {
      ...TWIN,
      latinName: "Sansevieria trifasciata",
    });
    await w.approvedSpecies(FULL);
    const r = await approve(w, proposal.caseId);
    expect(r.ok && r.value).toMatchObject({ status: "reviewed" });
  });

  it("US-BES-10 a cultivar of an approved name is another name and is approved", async () => {
    const w = new ReviewWorld();
    await w.approvedSpecies(TWIN);
    const proposal = await w.proposeSpecies("keeper", {
      ...TWIN,
      latinName: "Dracaena trifasciata 'Laurentii'",
    });
    const r = await approve(w, proposal.caseId);
    expect(r.ok && r.value).toMatchObject({ status: "reviewed" });
  });

  it("US-BES-10 such a proposal can still be rejected, and merged into the approved species", async () => {
    const w = new ReviewWorld();
    const rejectable = await w.proposeSpecies("keeper", TWIN);
    const mergeable = await w.proposeSpecies("other", TWIN);
    const twin = await w.approvedSpecies(TWIN);
    const rejected = await w.call(catalogReview(w.reviews, w.species), "operator", {
      id: rejectable.caseId,
      status: "rejected",
      reason: "Quelle prüfen",
    });
    expect(rejected.ok && rejected.value).toMatchObject({ status: "rejected" });
    const merged = await w.call(catalogMerge(w.reviews, w.species), "operator", {
      proposalId: mergeable.caseId,
      targetSpeciesId: twin.speciesId,
    });
    expect(merged.ok && merged.value.reviewCase).toMatchObject({
      status: "merged",
      mergedInto: twin.speciesId,
    });
  });
});
