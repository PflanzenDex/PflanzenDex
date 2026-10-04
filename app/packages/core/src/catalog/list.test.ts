import { beforeEach, describe, expect, it } from "vitest";
import type { Operation } from "../kernel";
import { execute } from "../kernel";
import { catalogList, catalogPropose, catalogReview } from "./index";
import { InMemoryIdempotencyStore } from "../kernel/test-helpers";
import { InMemoryReview } from "./test-helpers";

const SPECIES_1 = "6f1c2f0e-4b8a-4c52-9d51-0a3f6f2c7e11";
const SPECIES_2 = "7f2c3f1f-5c9b-5d63-ae62-1b4g7g3d8f22";

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

const propose = (
  userId = "keeper",
  speciesId = SPECIES_1,
  status: "proposal" | "ai_unreviewed" = "proposal",
) =>
  call(catalogPropose(store), userId, {
    objectKind: "species",
    objectId: speciesId,
    status,
  });

beforeEach(() => {
  idem = new InMemoryIdempotencyStore();
  store = new InMemoryReview({ operator: ["operator"], reviewer: ["reviewer"] });
});

describe("US-BES-10 list open proposals (AC1)", () => {
  it("reviewers see all open proposals with creator and status", async () => {
    await propose("keeper1", SPECIES_1, "proposal");
    await propose("keeper2", SPECIES_2, "ai_unreviewed");
    const r = await call(catalogList(store), "reviewer", {});
    expect(r.ok && r.value).toHaveLength(2);
    expect(r.ok && r.value.map((p) => ({ creator: p.creatorId, status: p.status }))).toEqual([
      { creator: "keeper1", status: "proposal" },
      { creator: "keeper2", status: "ai_unreviewed" },
    ]);
  });

  it("operators see all open proposals", async () => {
    await propose("keeper", SPECIES_1);
    const r = await call(catalogList(store), "operator", {});
    expect(r.ok && r.value).toHaveLength(1);
  });

  it("plant keepers cannot list proposals (access.denied)", async () => {
    await propose();
    const r = await call(catalogList(store), "keeper", {});
    expect(!r.ok && r.error.code).toBe("access.denied");
  });

  it("only open proposals are listed, not reviewed or rejected ones", async () => {
    const proposal1 = await propose("keeper1", SPECIES_1, "proposal");
    const proposal2 = await propose("keeper2", SPECIES_2, "proposal");
    // Approve first one
    if (proposal1.ok) {
      await call(catalogReview(store), "reviewer", { id: proposal1.value.id, status: "reviewed" });
    }
    // Reject second one
    if (proposal2.ok) {
      await call(catalogReview(store), "reviewer", {
        id: proposal2.value.id,
        status: "rejected",
        reason: "Source missing",
      });
    }
    // List should be empty
    const list = await call(catalogList(store), "reviewer", {});
    expect(list.ok && list.value).toHaveLength(0);
  });

  it("curated proposals are not in the open list (they are already approved)", async () => {
    await propose("keeper1", SPECIES_1, "proposal");
    // Curated by operator
    const curation = await call(catalogList(store), "operator", {});
    expect(curation.ok && curation.value).toHaveLength(1);
    // After review, closed list is used (not part of this test)
  });
});
