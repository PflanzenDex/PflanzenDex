import { beforeEach, describe, expect, it } from "vitest";
import { execute } from "../../kernel";
import { InMemoryIdempotencyStore } from "../../kernel/test-helpers";
import {
  operatorDeletions,
  privacyMarkIdentityRemoved,
  type DeletionQueueRow,
  type DeletionQueueStore,
} from "./index";

const NOW = new Date("2026-10-30T00:00:00.000Z");
const ENTRY_OPEN = "22222222-2222-4222-8222-222222222222";
const ENTRY_CLOSED = "33333333-3333-4333-8333-333333333333";
const ENTRY_UNKNOWN = "44444444-4444-4444-8444-444444444444";

/** An in-memory queue: the rows the database would return, and the entries already closed. */
class InMemoryQueue implements DeletionQueueStore {
  reads = 0;
  constructor(
    private rows: DeletionQueueRow[],
    private closed: Set<string>,
  ) {}
  async queue() {
    this.reads += 1;
    return this.rows;
  }
  async markIdentityRemoved(_userId: string, entryId: string) {
    const open = this.rows.find((row) => row.entryId === entryId);
    if (open) {
      this.rows = this.rows.filter((row) => row !== open);
      this.closed.add(entryId);
      return "marked" as const;
    }
    return this.closed.has(entryId) ? ("already" as const) : ("unknown" as const);
  }
}

const requestRow: DeletionQueueRow = {
  kind: "request",
  entryId: null,
  requestedAt: new Date("2026-10-01T00:00:00.000Z"),
  subject: null,
  completedAt: null,
};
const identityRow: DeletionQueueRow = {
  kind: "identity",
  entryId: ENTRY_OPEN,
  requestedAt: new Date("2026-09-10T00:00:00.000Z"),
  subject: "sub-open",
  completedAt: new Date("2026-09-17T00:00:00.000Z"),
};

let access: { roles(userId: string): Promise<readonly string[]> };
const ROLES: Record<string, string[]> = { olga: ["operator"], rita: ["reviewer"], kai: [] };
let idem: InMemoryIdempotencyStore;
let queue: InMemoryQueue;
let counter = 0;

const mark = (entryId: unknown, userId: string | null = "olga") =>
  execute(
    privacyMarkIdentityRemoved({ access, queue }),
    { idempotency: idem },
    { context: { userId }, input: { entryId }, idempotencyKey: `k${++counter}` },
  );

beforeEach(() => {
  access = { roles: async (userId) => ROLES[userId] ?? [] };
  idem = new InMemoryIdempotencyStore();
  queue = new InMemoryQueue([requestRow, identityRow], new Set([ENTRY_CLOSED]));
});

describe("US-ACC-04 the operator sees the open deletions", () => {
  it("US-ACC-04 lists the near and passed items and every open identity removal, with dates and no account", async () => {
    const r = await operatorDeletions({ access, queue }, "olga", NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.warningDays).toBe(7);
    // The request of 1 October is due on 1 November: near on 30 October. The identity of 10 September is due on 10 October: past.
    expect(r.value.near.map((item) => item.kind)).toEqual(["request"]);
    expect(r.value.past.map((item) => item.subject)).toEqual(["sub-open"]);
    expect(r.value.identityRemovals.map((item) => item.subject)).toEqual(["sub-open"]);
    const keys = Object.keys(r.value.past[0] ?? {});
    expect(keys).not.toContain("accountId");
    expect(keys).not.toContain("account_id");
  });

  it("US-ACC-04 a plant keeper or a reviewer gets access.denied and the queue is not read", async () => {
    for (const userId of ["kai", "rita"]) {
      const r = await operatorDeletions({ access, queue }, userId, NOW);
      expect(r.ok ? null : r.error.code).toBe("access.denied");
    }
    expect(queue.reads).toBe(0);
  });

  it("US-ACC-04 an empty queue answers empty lists, so the card can say what to do next (P-09)", async () => {
    queue = new InMemoryQueue([], new Set());
    const r = await operatorDeletions({ access, queue }, "olga", NOW);
    expect(r.ok && r.value).toMatchObject({ near: [], past: [], identityRemovals: [] });
  });
});

describe("US-ACC-04 the operator marks an identity removal that was done by hand", () => {
  it("US-ACC-04 closes the open entry, and a repeat changes nothing and answers success (idempotent)", async () => {
    const first = await mark(ENTRY_OPEN);
    expect(first.ok && first.value).toEqual({ entryId: ENTRY_OPEN, outcome: "marked" });
    const second = await mark(ENTRY_OPEN);
    expect(second.ok && second.value).toEqual({ entryId: ENTRY_OPEN, outcome: "already" });
    const r = await operatorDeletions({ access, queue }, "olga", NOW);
    expect(r.ok && r.value.identityRemovals).toEqual([]);
  });

  it("US-ACC-04 an unknown entry answers privacy.entry_not_found", async () => {
    const r = await mark(ENTRY_UNKNOWN);
    expect(r.ok ? null : r.error.code).toBe("privacy.entry_not_found");
  });

  it("US-ACC-04 a plant keeper or a reviewer gets access.denied and nothing changes", async () => {
    const r = await mark(ENTRY_OPEN, "rita");
    expect(r.ok ? null : r.error.code).toBe("access.denied");
    expect(queue.reads).toBe(0);
    const still = await operatorDeletions({ access, queue }, "olga", NOW);
    expect(still.ok && still.value.identityRemovals.map((item) => item.entryId)).toEqual([
      ENTRY_OPEN,
    ]);
  });

  it("US-ACC-04 an entry id that is not a UUID is refused with input.invalid before anything is read", async () => {
    const r = await mark("not-an-id");
    expect(r.ok ? null : r.error.code).toBe("input.invalid");
  });
});
