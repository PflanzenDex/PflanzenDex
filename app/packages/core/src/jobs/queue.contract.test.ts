import { describe, expect, it } from "vitest";
import { InMemoryJobQueue } from "./test-helpers";
import type { JobQueue, NewJob } from "./types";

const T0 = new Date("2026-10-05T10:00:00Z");
const at = (ms: number) => new Date(T0.getTime() + ms);
const job = (extra: Partial<NewJob> = {}): NewJob => ({
  type: "test.job",
  dedupeKey: null,
  payload: { id: "x" },
  runAt: T0,
  expiresAt: null,
  maxAttempts: 3,
  ...extra,
});

/** Contract of the port `JobQueue` (ADR 0003): every adapter must pass these cases (US-QS-03, TE-06). */
export function jobQueueContract(name: string, make: () => JobQueue | Promise<JobQueue>) {
  describe(`JobQueue contract · ${name}`, () => {
    it("US-QS-03 enqueue stores a queued job that claim hands out once and counts the attempt", async () => {
      const q = await make();
      const { job: stored, created } = await q.enqueue(job());
      expect(created).toBe(true);
      expect(stored).toMatchObject({ status: "queued", attempts: 0, payload: { id: "x" } });
      const claimed = await q.claim("w1", T0, 1000);
      expect(claimed).toMatchObject({ id: stored.id, status: "running", attempts: 1 });
      expect(await q.claim("w2", T0, 1000)).toBeNull();
    });

    it("US-QS-03 an open job with the same type and dedupe key is merged, a finished one is not", async () => {
      const q = await make();
      const first = await q.enqueue(job({ dedupeKey: "specimen-1" }));
      const again = await q.enqueue(job({ dedupeKey: "specimen-1" }));
      expect(again.created).toBe(false);
      expect(again.job.id).toBe(first.job.id);
      expect((await q.enqueue(job({ dedupeKey: "specimen-2" }))).created).toBe(true);
      expect((await q.enqueue(job({ type: "test.other", dedupeKey: "specimen-1" }))).created).toBe(
        true,
      );
      const claimed = await q.claim("w1", T0, 1000);
      expect((await q.enqueue(job({ dedupeKey: "specimen-1" }))).created).toBe(false);
      await q.succeed(claimed?.id ?? "", "w1", T0);
      expect((await q.enqueue(job({ dedupeKey: "specimen-1" }))).created).toBe(true);
    });

    it("US-QS-03 a job is not due before its run time", async () => {
      const q = await make();
      await q.enqueue(job({ runAt: at(5000) }));
      expect(await q.claim("w1", T0, 1000)).toBeNull();
      expect(await q.claim("w1", at(5000), 1000)).not.toBeNull();
    });

    it("US-QS-03 succeed finishes a job; a worker that does not own it changes nothing", async () => {
      const q = await make();
      const { job: stored } = await q.enqueue(job());
      await q.claim("w1", T0, 1000);
      expect(await q.succeed(stored.id, "w2", T0)).toBe(false);
      expect(await q.succeed(stored.id, "w1", T0)).toBe(true);
      expect(await q.counts()).toMatchObject({ succeeded: 1, running: 0, queued: 0 });
      expect(await q.succeed(stored.id, "w1", T0)).toBe(false);
    });

    it("US-QS-03 fail with a retry time queues the job again with the error kept", async () => {
      const q = await make();
      const { job: stored } = await q.enqueue(job());
      await q.claim("w1", T0, 1000);
      expect(await q.fail(stored.id, "w1", T0, { error: "boom", retryAt: at(2000) })).toBe(true);
      expect(await q.claim("w1", at(1000), 1000)).toBeNull();
      expect(await q.claim("w1", at(2000), 1000)).toMatchObject({
        id: stored.id,
        attempts: 2,
        lastError: "boom",
      });
    });

    it("US-QS-03 fail without a retry time makes the job dead and keeps it visible", async () => {
      const q = await make();
      const { job: stored } = await q.enqueue(job());
      await q.claim("w1", T0, 1000);
      await q.fail(stored.id, "w1", T0, { error: "boom", retryAt: null });
      expect(await q.counts()).toMatchObject({ dead: 1 });
      expect(await q.claim("w1", at(10_000), 1000)).toBeNull();
    });

    it("US-QS-03 a job whose worker vanished is taken over after the lease, until its attempts are used up", async () => {
      const q = await make();
      const { job: stored } = await q.enqueue(job({ maxAttempts: 2 }));
      await q.claim("w1", T0, 1000);
      expect(await q.claim("w2", at(999), 1000)).toBeNull();
      expect(await q.claim("w2", at(1000), 1000)).toMatchObject({ id: stored.id, attempts: 2 });
      expect(await q.succeed(stored.id, "w1", at(1500))).toBe(false);
      expect(await q.claim("w3", at(2000), 1000)).toBeNull();
      expect(await q.counts()).toMatchObject({ dead: 1, running: 0, queued: 0 });
    });

    it("US-QS-03 a job past its expiry is dropped as expired and never run", async () => {
      const q = await make();
      await q.enqueue(job({ expiresAt: at(1000) }));
      expect(await q.claim("w1", at(1000), 1000)).toBeNull();
      expect(await q.counts()).toMatchObject({ expired: 1, queued: 0 });
    });

    it("US-QS-03 purge deletes only finished jobs that ended before the given time", async () => {
      const q = await make();
      const a = await q.enqueue(job());
      await q.enqueue(job({ runAt: at(60_000) }));
      await q.claim("w1", T0, 1000);
      await q.succeed(a.job.id, "w1", T0);
      expect(await q.purge(T0)).toBe(0);
      expect(await q.purge(at(1))).toBe(1);
      expect(await q.counts()).toMatchObject({ succeeded: 0, queued: 1 });
    });
  });
}

jobQueueContract("in-memory adapter", () => new InMemoryJobQueue());
