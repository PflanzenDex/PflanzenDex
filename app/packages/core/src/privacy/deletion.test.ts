import { describe, expect, it } from "vitest";
import { execute } from "../kernel/operation";
import { InMemoryIdempotencyStore } from "../kernel/test-helpers";
import { InMemoryJobQueue } from "../jobs/test-helpers";
import {
  DELETE_ACCOUNT_JOB,
  DELETION_LIMITS,
  privacyCancelDeletion,
  privacyRequestDeletion,
  type DeletionRequest,
  type DeletionStore,
} from "./index";

class InMemoryDeletions implements DeletionStore {
  readonly rows = new Map<string, DeletionRequest>();
  async find(userId: string) {
    return this.rows.get(userId) ?? null;
  }
  async request(userId: string, dueAt: Date) {
    const kept = this.rows.get(userId);
    if (kept) return kept;
    const row = { requestedAt: new Date("2026-10-16T10:00:00Z"), dueAt };
    this.rows.set(userId, row);
    return row;
  }
  async cancel(userId: string) {
    return this.rows.delete(userId);
  }
}

const NOW = new Date("2026-10-16T10:00:00Z");
const setup = () => {
  const store = new InMemoryDeletions();
  const queue = new InMemoryJobQueue();
  const idempotency = new InMemoryIdempotencyStore();
  let n = 0;
  const call = (op: Parameters<typeof execute>[0], userId: string | null, input: unknown) =>
    execute(op, { idempotency }, { context: { userId }, input, idempotencyKey: `k${++n}` });
  const request = (userId: string | null, input: unknown = { confirm: true }) =>
    call(privacyRequestDeletion({ store, queue, now: () => NOW }) as never, userId, input);
  const cancel = (userId: string) => call(privacyCancelDeletion({ store }) as never, userId, {});
  return { store, queue, request, cancel };
};

describe("US-ACC-04 deleting the account needs a confirmation and waits", () => {
  it("US-ACC-04 stores the request with the end of the grace period and orders the job for that moment", async () => {
    const { store, queue, request } = setup();
    const r = await request("anna");
    const dueAt = new Date(NOW.getTime() + DELETION_LIMITS.graceDays * 86_400_000);
    expect(r).toMatchObject({ ok: true, value: { dueAt } });
    expect(store.rows.get("anna")?.dueAt).toEqual(dueAt);
    const job = await queue.claim("w", new Date(dueAt.getTime() + 1), 1000);
    expect(job).toMatchObject({ type: DELETE_ACCOUNT_JOB, payload: { accountId: "anna" } });
    expect(await queue.claim("w2", NOW, 1000)).toBeNull();
  });

  it("US-ACC-04 refuses without an explicit confirmation and writes nothing", async () => {
    const { store, queue, request } = setup();
    for (const bad of [{}, { confirm: false }, { confirm: "true" }, null])
      expect(await request("anna", bad)).toMatchObject({ ok: false });
    expect(store.rows.size).toBe(0);
    expect(await queue.counts()).toMatchObject({ queued: 0 });
  });

  it("US-ACC-04 refuses a caller who is not signed in", async () => {
    const { store, request } = setup();
    expect(await request(null)).toMatchObject({
      ok: false,
      error: { code: "access.not_signed_in" },
    });
    expect(store.rows.size).toBe(0);
  });

  it("US-ACC-04 repeating the request keeps the first deadline and orders no second job", async () => {
    const { queue, request } = setup();
    const first = await request("anna");
    const second = await request("anna");
    expect(second).toEqual(first);
    expect(await queue.counts()).toMatchObject({ queued: 1 });
  });

  it("US-ACC-04 the keeper can withdraw during the grace period, and withdrawing twice is harmless", async () => {
    const { store, request, cancel } = setup();
    await request("anna");
    expect(await cancel("anna")).toMatchObject({ ok: true });
    expect(store.rows.has("anna")).toBe(false);
    expect(await cancel("anna")).toMatchObject({ ok: true });
  });

  it("US-ACC-04 one keeper's request never touches another's", async () => {
    const { store, request, cancel } = setup();
    await request("anna");
    await request("ben");
    await cancel("anna");
    expect(store.rows.has("ben")).toBe(true);
  });
});
