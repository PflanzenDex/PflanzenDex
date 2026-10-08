import assert from "node:assert/strict";
import { test } from "node:test";
import { decide, resolve, runIdOf } from "./ci-reuse.mjs";

const run = (id, status, conclusion, completedAt = "2026-10-08T10:00:00Z") => ({
  details_url: `https://github.com/PflanzenDex/PflanzenDex/actions/runs/${id}/job/9`,
  status,
  conclusion,
  completed_at: completedAt,
});

test("US-QG-02: the run id comes from the details URL", () => {
  assert.equal(runIdOf(run(42, "completed", "success")), "42");
  assert.equal(runIdOf({ details_url: "https://example.org/x" }), null);
});

test("US-QG-02: a green job on the same commit is reused", () => {
  assert.equal(decide([run(1, "completed", "success")], 2), "success");
});

test("US-QG-02: nothing to reuse runs the job in full", () => {
  assert.equal(decide([], 2), "none");
});

test("US-QG-02: a failed latest run is never reused, an older green one does not help", () => {
  const runs = [
    run(1, "completed", "success", "2026-10-08T09:00:00Z"),
    run(3, "completed", "failure", "2026-10-08T10:00:00Z"),
  ];
  assert.equal(decide(runs, 4), "none");
});

test("US-QG-02: skipped and cancelled runs did no work and never count", () => {
  const runs = [
    run(1, "completed", "success", "2026-10-08T09:00:00Z"),
    run(3, "completed", "cancelled", "2026-10-08T10:00:00Z"),
    run(5, "completed", "skipped", "2026-10-08T11:00:00Z"),
  ];
  assert.equal(decide(runs, 6), "success");
  assert.equal(decide([run(3, "completed", "cancelled")], 6), "none");
});

test("US-QG-02: the current run's own (skipped or queued) job is left out", () => {
  assert.equal(decide([run(1, "completed", "success"), run(2, "queued", null)], 2), "success");
});

test("US-QG-02: another run still going means waiting", () => {
  assert.equal(decide([run(1, "in_progress", null)], 2), "pending");
});

test("US-QG-02: resolve waits for the running job and takes its result", async () => {
  const answers = [[run(1, "in_progress", null)], [run(1, "completed", "success")]];
  const sleeps = [];
  const state = await resolve(
    "app",
    { runId: 2 },
    { load: async () => answers.shift(), sleep: async (s) => sleeps.push(s) },
  );
  assert.equal(state, "success");
  assert.equal(sleeps.length, 1);
});

test("US-QG-02: resolve gives up after the wait and runs the job in full", async () => {
  const state = await resolve(
    "app",
    { runId: 2 },
    { load: async () => [run(1, "in_progress", null)], sleep: async () => {}, waitSeconds: 60 },
  );
  assert.equal(state, "none");
});

test("US-QG-02: an API error runs the job in full, nothing is assumed green", async () => {
  const state = await resolve(
    "app",
    { runId: 2 },
    {
      load: async () => {
        throw new Error("GitHub API 403");
      },
    },
  );
  assert.equal(state, "none");
});
