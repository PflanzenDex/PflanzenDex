import { randomUUID } from "node:crypto";
import { enqueueJob } from "@pflanzendex/core";
import { JobsPostgres, migrate, openOwnerPool, openFixturePool } from "@pflanzendex/db";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createJobWorker } from "./job-worker";

// US-QS-03, TE-06: the worker runs queued jobs against the real queue (PostgreSQL) and repeats what failed.
let pool: Pool;
let admin: Pool; // superuser fixture pool: setup, cleanup and cross-tenant observation (QG-D1)
let queue: JobsPostgres;
let clock = new Date("2030-01-01T10:00:00Z");
const now = () => clock;
const type = `test.w${randomUUID()
  .replace(/[^a-f]/g, "")
  .slice(0, 8)}`;
const events: string[] = [];

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  queue = new JobsPostgres(pool);
});
beforeEach(async () => {
  clock = new Date("2030-01-01T10:00:00Z");
  events.length = 0;
  await admin.query("delete from job where type = $1", [type]);
});
afterAll(async () => {
  await admin.query("delete from job where type = $1", [type]);
  await pool.end();
  await admin.end();
});

const worker = (handler: () => Promise<void>) =>
  createJobWorker({
    queue,
    handlers: { [type]: handler },
    now,
    workerId: "test",
    report: (e) => events.push(e.kind),
  });
const order = (extra = {}) => enqueueJob({ queue, now }, { type, runAt: now(), ...extra });
const statusOf = async () =>
  (
    await admin.query<{ status: string }>("select status from job where type = $1", [type])
  ).rows.map((r) => r.status);

describe("US-QS-03 the job worker", () => {
  it("US-QS-03 runs a queued job once and ordering it twice runs it once", async () => {
    let calls = 0;
    const w = worker(async () => void (calls += 1));
    await order({ dedupeKey: "a" });
    await order({ dedupeKey: "a" });
    await w.tick();
    await w.tick();
    expect(calls).toBe(1);
    expect(await statusOf()).toEqual(["succeeded"]);
  });

  it("US-QS-03 a failed job is repeated after the backoff and the failure is reported, not swallowed (P-10)", async () => {
    let calls = 0;
    const w = worker(async () => {
      calls += 1;
      if (calls === 1) throw new Error("temporary");
    });
    await order();
    await w.tick();
    expect(await statusOf()).toEqual(["queued"]);
    await w.tick();
    expect(calls).toBe(1);
    clock = new Date(clock.getTime() + 30_000);
    await w.tick();
    expect(calls).toBe(2);
    expect(await statusOf()).toEqual(["succeeded"]);
    expect(events).toEqual(["retry", "succeeded"]);
  });

  it("US-QS-03 a queue error is reported and the next tick still works (the loop never dies)", async () => {
    const broken = createJobWorker({
      queue: { ...queue, claim: () => Promise.reject(new Error("db down")) } as never,
      handlers: {},
      intervalMs: 5,
      report: (e) => events.push(e.kind),
    });
    broken.start();
    await new Promise((r) => setTimeout(r, 40));
    await broken.stop();
    expect(events.filter((e) => e === "error").length).toBeGreaterThan(1);
  });
  it("US-QS-03 without a report function failures go to stderr, with the job type and the error (P-10)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const w = createJobWorker({
      queue,
      handlers: { [type]: () => Promise.reject(new Error("always")) },
      now,
    });
    await order({ maxAttempts: 1 });
    await w.tick();
    await order({ dedupeKey: "later" });
    const failing = createJobWorker({
      queue: { ...queue, claim: () => Promise.reject(new Error("db down")) } as never,
      handlers: {},
      intervalMs: 5,
    });
    failing.start();
    failing.start();
    await new Promise((r) => setTimeout(r, 30));
    await failing.stop();
    const lines = spy.mock.calls.map((c) => c.join(" "));
    spy.mockRestore();
    expect(lines.some((l) => l.includes(type) && l.includes("dead: always"))).toBe(true);
    expect(lines.some((l) => l.includes("job queue error"))).toBe(true);
  });

  it("TE-06 finished jobs older than the retention are purged by the worker, younger ones stay", async () => {
    const w = worker(async () => undefined);
    await order({ dedupeKey: "old" });
    await w.tick();
    clock = new Date(clock.getTime() + 31 * 24 * 60 * 60 * 1000);
    await order({ dedupeKey: "young" });
    await w.tick();
    expect(await statusOf()).toEqual(["succeeded"]);
  });
});
