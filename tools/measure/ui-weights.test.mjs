// US-QG-01 (issue 1667): the parsing, the medians and the speed factor of make ui-weights, and the refusal of bad run ids.
// Pure: the logs are fixtures (lines of CI shard logs in the form gh prints them), no gh call.
import assert from "node:assert/strict";
import test from "node:test";
import { checkRuns, median, parseShardLog, weightsFile, weightsFrom } from "./ui-weights.mjs";

// Lines copied from the CI logs of run 42356054981 (one-screen shard 1, a11y-routes shard 3, ui shard 3).
const ONE_SCREEN_LINE =
  "one-screen shard 1\tRun make one-screen SHARD=1/3 -j3 -Otarget\t2026-11-07T08:38:05.8155484Z   ✓   2 [one-screen] › tests/accessibility/routes/one-screen.spec.ts:56:5 › US-QS-15 every screen fits the window (QG-U8) › US-QS-15 one screen: collection-view-plants-group-phase (23.0s)";
const A11Y_LINE =
  "a11y-routes shard 3\tRun make a11y-routes SHARD=3/3 -j3 -Otarget\t2026-11-07T08:39:46.5730221Z   ✓   2 [a11y-routes] › tests/accessibility/routes/a11y-routes.spec.ts:39:5 › FR-QG-24 accessibility per route (QG-U7) › FR-QG-24 axe and keyboard walk: account-settings-sheet-wishlist (29.2s)";
const SELF_TEST_LINE =
  "ui shard 3\tRun make ui-gates SHARD=3/4 -j3 -Otarget\t2026-11-07T13:54:51.3032922Z   ✓   4 [one-screen] › tests/accessibility/routes/merge-shards.spec.ts:55:3 › US-QG-01 self-test: the shards of the UI gates › US-QG-01 self-test: a shard that is missing, or a screen measured twice, fails the merge proof (2ms)";
// The same shape as a failed test (✘) and as the durations of Playwright below one second and above one minute.
const FAILED_LINE =
  "ui shard 3\tRun make ui-gates SHARD=3/6 -j3 -Otarget\t2026-11-07T13:55:01.0000000Z   ✘   5 [one-screen] › tests/accessibility/routes/one-screen.spec.ts:56:5 › US-QS-15 every screen fits the window (QG-U8) › US-QS-15 one screen: discover (12.0s)";
const MILLISECONDS_LINE = FAILED_LINE.replace("✘", "✓").replace(
  "discover (12.0s)",
  "today (950ms)",
);
const MINUTES_LINE = FAILED_LINE.replace("✘", "✓").replace("discover (12.0s)", "friends (2.5m)");

/** One job's samples: the same screens at the given seconds, `times` as { "gate screen": sec }. */
const job = (times, speed = 1) =>
  Object.entries(times).map(([key, sec]) => {
    const [gate, screen] = key.split(" ");
    return { gate, screen, sec: sec * speed };
  });

test("US-QG-01 parseShardLog reads the passed screens of both gates in seconds, milliseconds and minutes", () => {
  const log = [ONE_SCREEN_LINE, A11Y_LINE, MILLISECONDS_LINE, MINUTES_LINE].join("\n");
  assert.deepEqual(parseShardLog(log), [
    {
      gate: "one-screen",
      screen: "collection-view-plants-group-phase",
      sec: 23,
    },
    {
      gate: "a11y-routes",
      screen: "account-settings-sheet-wishlist",
      sec: 29.2,
    },
    { gate: "one-screen", screen: "today", sec: 0.95 },
    { gate: "one-screen", screen: "friends", sec: 150 },
  ]);
});

test("US-QG-01 parseShardLog ignores failed tests, self-test specs and other output", () => {
  const log = [FAILED_LINE, SELF_TEST_LINE, "  53 passed (2.2m)", ""].join("\n");
  assert.deepEqual(parseShardLog(log), []);
});

test("US-QG-01 median takes the middle value of an odd count and the mean of the two middle values of an even count", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([7]), 7);
  assert.throws(() => median([]), /median of no value/);
});

test("US-QG-01 weightsFrom gives the median per screen and gate, rounded to 0.1 s and sorted by screen id", () => {
  const weights = weightsFrom([
    job({
      "one-screen zeta": 12.34,
      "one-screen alpha": 3.06,
      "a11y-routes alpha": 5,
    }),
  ]);
  assert.deepEqual(Object.keys(weights["one-screen"]), ["alpha", "zeta"]);
  assert.deepEqual(weights, {
    "one-screen": { alpha: 3.1, zeta: 12.3 },
    "a11y-routes": { alpha: 5 },
  });
});

test("US-QG-01 weightsFrom: a job that ran every test at twice the speed gives the weights of a normal job", () => {
  const normal = {
    "one-screen a": 10,
    "one-screen b": 30,
    "a11y-routes a": 4,
    "a11y-routes b": 8,
  };
  const withSlow = weightsFrom([job(normal), job(normal), job(normal), job(normal, 2)]);
  assert.deepEqual(withSlow, weightsFrom([job(normal), job(normal), job(normal)]));
  assert.deepEqual(withSlow, {
    "one-screen": { a: 10, b: 30 },
    "a11y-routes": { a: 4, b: 8 },
  });
});

test("US-QG-01 weightsFrom refuses a gate without any passed test, so no weight is invented", () => {
  assert.throws(
    () => weightsFrom([job({ "one-screen a": 1 }), job({ "one-screen a": 2 })]),
    /no a11y-routes test/,
  );
});

test("US-QG-01 weightsFrom refuses a job without any passed screen test", () => {
  assert.throws(
    () => weightsFrom([job({ "one-screen a": 1, "a11y-routes a": 1 }), []]),
    /a job without any passed screen test/,
  );
});

test("US-QG-01 checkRuns refuses fewer than three runs", () => {
  assert.throws(
    () => checkRuns(["42356054981", "42360032286"]),
    /at least 3 runs: one run's weights do not predict the split/,
  );
  assert.throws(() => checkRuns([]), /at least 3 runs/);
});

test("US-QG-01 checkRuns refuses an argument that is not a run id, before any gh call", () => {
  assert.throws(() => checkRuns(["42356054981", "42360032286", "3a"]), /not a CI run id: 3a/);
  assert.throws(
    () => checkRuns(["42356054981", "https://github.com/o/r/actions/runs/1", "42360073172"]),
    /not a CI run id/,
  );
  assert.throws(() => checkRuns(["1", "-2", "3"]), /not a CI run id: -2/);
});

test("US-QG-01 checkRuns accepts three different run ids and refuses a run given twice", () => {
  assert.deepEqual(checkRuns(["1", "2", "3"]), ["1", "2", "3"]);
  assert.throws(() => checkRuns(["1", "1", "2"]), /each run once, repeated: 1/);
});

test("US-QG-01 checkRuns accepts the attempts of one run as runs of their own (issue 1680)", () => {
  assert.deepEqual(checkRuns(["7", "7/2", "7/3"]), ["7", "7/2", "7/3"]);
  assert.throws(() => checkRuns(["7", "7/x", "8"]), /not a CI run id: 7\/x/);
  assert.throws(() => checkRuns(["7/2", "7/2", "8"]), /each run once, repeated: 7\/2/);
});

test("US-QG-01 weightsFile names the runs and the refresh command, and keeps the two gates", () => {
  const file = weightsFile({ "one-screen": { a: 1 }, "a11y-routes": { a: 2 } }, ["1", "2", "3"]);
  assert.deepEqual(Object.keys(file), ["source", "gates"]);
  assert.match(file.source, /CI runs 1 2 3 \(list reporter/);
  assert.match(file.source, /make ui-weights RUNS="<id> <id> <id>" \(US-QG-01, issue 1667\)/);
  assert.match(file.source, /A screen without an entry counts as the median of its gate/);
  assert.deepEqual(file.gates, {
    "one-screen": { a: 1 },
    "a11y-routes": { a: 2 },
  });
});
