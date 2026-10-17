import { describe, expect, it } from "vitest";
import { enqueueJob } from "./enqueue";
import { InMemoryJobQueue } from "./test-helpers";

const NOW = new Date("2026-10-05T10:00:00Z");
const deps = () => ({ queue: new InMemoryJobQueue(), now: () => NOW });
const fields = (r: Awaited<ReturnType<typeof enqueueJob>>) =>
  r.ok ? [] : (r.error.details ?? []).map((d) => d.field);

describe("US-QS-03 order a background job", () => {
  it("US-QS-03 queues a job with defaults: due now, five attempts, empty payload", async () => {
    const d = deps();
    const r = await enqueueJob(d, { type: "monitoring.send_reminder" });
    expect(r.ok && r.value.created).toBe(true);
    expect(r.ok && r.value.job).toMatchObject({
      status: "queued",
      runAt: NOW,
      maxAttempts: 5,
      payload: {},
      dedupeKey: null,
    });
  });

  it("US-QS-03 ordering the same thing twice merges into one job", async () => {
    const d = deps();
    const input = { type: "pokedex.build", dedupeKey: "all" };
    await enqueueJob(d, input);
    const again = await enqueueJob(d, input);
    expect(again.ok && again.value.created).toBe(false);
    expect(await d.queue.counts()).toMatchObject({ queued: 1 });
  });

  it("US-QS-03 invalid input queues nothing and names the fields", async () => {
    const d = deps();
    const r = await enqueueJob(d, {
      type: "NoModule",
      dedupeKey: "",
      maxAttempts: 0,
      payload: { text: "x".repeat(9000) },
      runAt: NOW,
      expiresAt: NOW,
    });
    expect(r.ok).toBe(false);
    expect(fields(r).sort()).toEqual(["dedupeKey", "expiresAt", "maxAttempts", "payload", "type"]);
    expect(!r.ok && r.error.code).toBe("input.invalid");
    expect(await d.queue.counts()).toMatchObject({ queued: 0 });
  });
});
