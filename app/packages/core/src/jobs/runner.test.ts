import { describe, expect, it } from "vitest";
import { enqueueJob } from "./enqueue";
import { drainJobs, runNext, type JobHandler } from "./runner";
import { InMemoryJobQueue } from "./test-helpers";

let clock = new Date("2026-10-05T10:00:00Z");
const setup = (handlers: Record<string, JobHandler>) => {
  clock = new Date("2026-10-05T10:00:00Z");
  const queue = new InMemoryJobQueue();
  const now = () => clock;
  return {
    queue,
    runner: { queue, handlers, now, workerId: "w1" },
    enqueue: (type: string, extra = {}) => enqueueJob({ queue, now }, { type, ...extra }),
  };
};

describe("US-QS-03 background jobs deliver the same result on repetition", () => {
  it("US-QS-03 runs a due job with its payload and marks it succeeded", async () => {
    const seen: unknown[] = [];
    const t = setup({ "test.job": async (job) => void seen.push(job.payload) });
    await t.enqueue("test.job", { payload: { id: "a" } });
    expect((await runNext(t.runner)).kind).toBe("succeeded");
    expect(seen).toEqual([{ id: "a" }]);
    expect(await t.queue.counts()).toMatchObject({ succeeded: 1 });
    expect((await runNext(t.runner)).kind).toBe("idle");
  });

  it("US-QS-03 a failing job is retried with backoff and then succeeds, with the same result", async () => {
    let calls = 0;
    const t = setup({
      "test.job": async () => {
        calls += 1;
        if (calls < 3) throw new Error("temporary");
      },
    });
    await t.enqueue("test.job");
    const first = await runNext(t.runner);
    expect(first).toMatchObject({ kind: "retry", error: "temporary" });
    expect((await runNext(t.runner)).kind).toBe("idle");
    clock = new Date(clock.getTime() + 30_000);
    expect((await runNext(t.runner)).kind).toBe("retry");
    clock = new Date(clock.getTime() + 60_000);
    expect((await runNext(t.runner)).kind).toBe("succeeded");
    expect(calls).toBe(3);
  });

  it("US-QS-03 a job that keeps failing ends dead with its last error kept, nothing is lost silently (P-10)", async () => {
    const t = setup({ "test.job": async () => Promise.reject(new Error("always")) });
    const r = await t.enqueue("test.job", { maxAttempts: 1 });
    expect(await runNext(t.runner)).toMatchObject({ kind: "dead", error: "always" });
    expect(await t.queue.counts()).toMatchObject({ dead: 1 });
    expect(r.ok && t.queue.get(r.value.job.id)?.lastError).toBe("always");
  });

  it("US-QS-03 a job of an unknown type is dead at once instead of retried forever", async () => {
    const t = setup({});
    await t.enqueue("test.unknown");
    expect(await runNext(t.runner)).toMatchObject({ kind: "dead" });
  });

  it("US-QS-03 drain runs every due job and stops at the limit", async () => {
    const t = setup({ "test.job": async () => undefined });
    for (const key of ["a", "b", "c"]) await t.enqueue("test.job", { dedupeKey: key });
    expect((await drainJobs(t.runner, 2)).length).toBe(2);
    expect((await drainJobs(t.runner)).length).toBe(1);
  });
});
