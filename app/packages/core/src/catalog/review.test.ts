import { beforeEach, describe, expect, it } from "vitest";
import type { Operation } from "../kernel";
import { execute } from "../kernel";
import { catalogCurate, catalogReview, catalogPropose } from "./index";
import { InMemoryIdempotencyStore } from "../kernel/test-helpers";
import { InMemoryReview } from "./test-helpers";

const OBJECT = "6f1c2f0e-4b8a-4c52-9d51-0a3f6f2c7e11";
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

const propose = (user = "keeper", extra: object = {}) =>
  call(catalogPropose(store), user, {
    objectKind: "species",
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
      objectKind: "species",
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
    call(catalogReview(store), user, { id, status, reason });

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
    const fresh = { objectKind: "species", objectId: OBJECT };
    const no = await call(catalogCurate(store), "keeper", fresh);
    expect(!no.ok && no.error.code).toBe("access.denied");
    const yes = await call(catalogCurate(store), "operator", fresh);
    expect(yes.ok && yes.value).toMatchObject({ status: "curated", reviewedBy: "operator" });
  });
});
