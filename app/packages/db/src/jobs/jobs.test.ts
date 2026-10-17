import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrate, openOwnerPool, withAccount } from "../kernel/index.ts";
import { JobsPostgres, type NewJob } from "./jobs.ts";

// TE-06, US-QS-03: the job queue in real PostgreSQL (`make db-up`). Mirrors the contract test of the port in core
// (`queue.contract.test.ts`), which `db` cannot import, and adds what only the database can show: concurrency,
// the unique index and the closed door for the application role.
let pool: Pool;
let queue: JobsPostgres;
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

beforeAll(async () => {
  pool = openOwnerPool();
  await migrate(pool);
  queue = new JobsPostgres(pool);
});
beforeEach(async () => {
  await pool.query("delete from job");
});
afterAll(async () => {
  await pool.query("delete from job");
  await pool.end();
});

describe("US-QS-03 job queue in the database", () => {
  it("US-QS-03 enqueue stores a queued job that claim hands out once and counts the attempt", async () => {
    const { job: stored, created } = await queue.enqueue(job());
    expect(created).toBe(true);
    expect(stored).toMatchObject({ status: "queued", attempts: 0, payload: { id: "x" } });
    expect(await queue.claim("w1", T0, 1000)).toMatchObject({
      id: stored.id,
      status: "running",
      attempts: 1,
    });
    expect(await queue.claim("w2", T0, 1000)).toBeNull();
  });

  it("US-QS-03 an open job with the same type and dedupe key is merged, a finished one is not", async () => {
    const first = await queue.enqueue(job({ dedupeKey: "s1" }));
    const again = await queue.enqueue(job({ dedupeKey: "s1" }));
    expect(again).toMatchObject({ created: false, job: { id: first.job.id } });
    expect((await queue.enqueue(job({ dedupeKey: "s2" }))).created).toBe(true);
    expect((await queue.enqueue(job({ type: "test.other", dedupeKey: "s1" }))).created).toBe(true);
    const claimed = await queue.claim("w1", T0, 1000);
    expect((await queue.enqueue(job({ dedupeKey: "s1" }))).created).toBe(false);
    await queue.succeed(claimed?.id ?? "", "w1", T0);
    expect((await queue.enqueue(job({ dedupeKey: "s1" }))).created).toBe(true);
  });

  it("US-QS-03 ten concurrent orders of the same thing create exactly one job", async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () => queue.enqueue(job({ dedupeKey: "same" }))),
    );
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(new Set(results.map((r) => r.job.id)).size).toBe(1);
  });

  it("US-QS-03 concurrent workers never get the same job", async () => {
    for (let i = 0; i < 5; i++) await queue.enqueue(job({ dedupeKey: `k${i}` }));
    const claims = await Promise.all(
      Array.from({ length: 8 }, (_, i) => queue.claim(`w${i}`, T0, 1000)),
    );
    const ids = claims.flatMap((c) => (c ? [c.id] : []));
    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(5);
  });

  it("US-QS-03 a job is not due before its run time", async () => {
    await queue.enqueue(job({ runAt: at(5000) }));
    expect(await queue.claim("w1", T0, 1000)).toBeNull();
    expect(await queue.claim("w1", at(5000), 1000)).not.toBeNull();
  });

  it("US-QS-03 succeed finishes a job; a worker that does not own it changes nothing", async () => {
    const { job: stored } = await queue.enqueue(job());
    await queue.claim("w1", T0, 1000);
    expect(await queue.succeed(stored.id, "w2", T0)).toBe(false);
    expect(await queue.succeed(stored.id, "w1", T0)).toBe(true);
    expect(await queue.counts()).toMatchObject({ succeeded: 1, running: 0, queued: 0 });
    expect(await queue.succeed(stored.id, "w1", T0)).toBe(false);
  });

  it("US-QS-03 fail with a retry time queues the job again with the error kept", async () => {
    const { job: stored } = await queue.enqueue(job());
    await queue.claim("w1", T0, 1000);
    expect(await queue.fail(stored.id, "w1", T0, { error: "boom", retryAt: at(2000) })).toBe(true);
    expect(await queue.claim("w1", at(1000), 1000)).toBeNull();
    expect(await queue.claim("w1", at(2000), 1000)).toMatchObject({
      id: stored.id,
      attempts: 2,
      lastError: "boom",
    });
  });

  it("US-QS-03 fail without a retry time makes the job dead and keeps it visible", async () => {
    const { job: stored } = await queue.enqueue(job());
    await queue.claim("w1", T0, 1000);
    await queue.fail(stored.id, "w1", T0, { error: "boom", retryAt: null });
    expect(await queue.counts()).toMatchObject({ dead: 1 });
    expect(await queue.claim("w1", at(10_000), 1000)).toBeNull();
  });

  it("US-QS-03 a job whose worker vanished is taken over after the lease, until its attempts are used up", async () => {
    const { job: stored } = await queue.enqueue(job({ maxAttempts: 2 }));
    await queue.claim("w1", T0, 1000);
    expect(await queue.claim("w2", at(999), 1000)).toBeNull();
    expect(await queue.claim("w2", at(1000), 1000)).toMatchObject({ id: stored.id, attempts: 2 });
    expect(await queue.succeed(stored.id, "w1", at(1500))).toBe(false);
    expect(await queue.claim("w3", at(2000), 1000)).toBeNull();
    expect(await queue.counts()).toMatchObject({ dead: 1, running: 0, queued: 0 });
  });

  it("US-QS-03 a job past its expiry is dropped as expired and never run", async () => {
    await queue.enqueue(job({ expiresAt: at(1000) }));
    expect(await queue.claim("w1", at(1000), 1000)).toBeNull();
    expect(await queue.counts()).toMatchObject({ expired: 1, queued: 0 });
  });

  it("US-QS-03 purge deletes only finished jobs that ended before the given time", async () => {
    const a = await queue.enqueue(job());
    await queue.enqueue(job({ runAt: at(60_000) }));
    await queue.claim("w1", T0, 1000);
    await queue.succeed(a.job.id, "w1", T0);
    expect(await queue.purge(T0)).toBe(0);
    expect(await queue.purge(at(1))).toBe(1);
    expect(await queue.counts()).toMatchObject({ succeeded: 0, queued: 1 });
  });

  it("TE-06 the database refuses a malformed job type, a payload that is no object and too many attempts", async () => {
    const insert = (type: string, payload: string, attempts = 3) =>
      pool.query("insert into job (type, payload, max_attempts) values ($1, $2, $3)", [
        type,
        payload,
        attempts,
      ]);
    await expect(insert("NoModule", "{}")).rejects.toThrow(/check/);
    await expect(insert("test.job", "[]")).rejects.toThrow(/check/);
    await expect(insert("test.job", "{}", 21)).rejects.toThrow(/check/);
  });

  it("TE-06 P-04 the application role can neither read nor write the queue", async () => {
    const account = "00000000-0000-4000-8000-0000000000e6";
    await expect(withAccount(pool, account, (c) => c.query("select * from job"))).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      withAccount(pool, account, (c) => c.query("insert into job (type) values ('test.job')")),
    ).rejects.toThrow(/permission denied/);
  });
});
