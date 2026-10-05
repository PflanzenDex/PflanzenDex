import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { idsIn, problems, specIds } from "./merge-pr.mjs";

const known = new Set(["US-BES-06", "FR-QG-11"]);
const ok = {
  state: "OPEN",
  isDraft: false,
  baseRefName: "dev",
  title: "feat(bes): cards (US-BES-06)",
  body: "",
  files: [{ path: "app/packages/core/src/a.ts" }],
  statusCheckRollup: [{ name: "ci-status", conclusion: "SUCCESS" }],
};

test("US-DEV-02: ids are found in titles and bodies, once", () => {
  assert.deepEqual(idsIn("feat: x (US-BES-06) and FR-QG-11, US-BES-06, NFR-08"), [
    "US-BES-06",
    "FR-QG-11",
    "NFR-08",
  ]);
});

test("US-DEV-02: spec ids come from headings and table rows", () => {
  const dir = mkdtempSync(join(tmpdir(), "specs-"));
  writeFileSync(
    join(dir, "a.md"),
    "### US-ACC-01 · Title · ⬜\n\n| FR-ACC-01 | text | ⬜ |\n| **NFR-08** | text | ⬜ |\nSee US-XXX-99.\n",
  );
  assert.deepEqual([...specIds(dir)].sort(), ["FR-ACC-01", "NFR-08", "US-ACC-01"]);
});

test("US-DEV-02: a green PR into dev with a known story may be merged", () => {
  assert.deepEqual(problems(ok, known), []);
});

test("US-DEV-02: each failed condition is named and stops the merge", () => {
  assert.match(problems({ ...ok, isDraft: true }, known)[0], /draft/);
  assert.match(problems({ ...ok, baseRefName: "main" }, known)[0], /dev. only/);
  assert.match(problems({ ...ok, statusCheckRollup: [] }, known)[0], /not reported/);
  assert.match(
    problems(
      { ...ok, statusCheckRollup: [{ name: "ci-status", conclusion: "FAILURE" }] },
      known,
    )[0],
    /FAILURE/,
  );
  assert.match(
    problems({ ...ok, title: "chore: tidy", body: "no story" }, known)[0],
    /no spec, no merge/,
  );
  assert.match(problems({ ...ok, title: "feat: x (US-XXX-99)" }, known)[0], /no spec, no merge/);
});

test("US-DEV-02: a PR that changes a gate file is left to a human", () => {
  const gate = {
    ...ok,
    files: [
      ...ok.files,
      { path: ".github/workflows/ci.yml" },
      { path: "app/tools/workflow/merge-pr.mjs" },
    ],
  };
  assert.match(problems(gate, known)[0], /gate files.*ci\.yml.*merge-pr\.mjs/);
});

const run = (conclusion, startedAt, completedAt, status = "COMPLETED") => ({
  name: "ci-status",
  status,
  conclusion,
  startedAt,
  completedAt,
});
const withRuns = (...runs) => ({ ...ok, statusCheckRollup: runs });

test("US-DEV-02: a green re-run after a cancelled run on the same commit may be merged", () => {
  const failedFirst = withRuns(
    run("FAILURE", "2026-01-01T23:14:00Z", "2026-01-01T23:14:57Z"),
    run("SUCCESS", "2026-01-01T23:15:00Z", "2026-01-01T23:16:41Z"),
  );
  assert.deepEqual(problems(failedFirst, known), []);
  const reversedOrder = withRuns(...failedFirst.statusCheckRollup.toReversed());
  assert.deepEqual(problems(reversedOrder, known), []);
});

test("US-DEV-02: a failing latest run stops the merge although an older run was green", () => {
  const pr = withRuns(
    run("SUCCESS", "2026-01-01T23:10:00Z", "2026-01-01T23:11:00Z"),
    run("FAILURE", "2026-01-01T23:15:00Z", "2026-01-01T23:16:00Z"),
  );
  assert.match(problems(pr, known)[0], /FAILURE/);
});

test("US-DEV-02: only cancelled runs stop the merge", () => {
  const pr = withRuns(
    run("CANCELLED", "2026-01-01T23:10:00Z", "2026-01-01T23:11:00Z"),
    run("CANCELLED", "2026-01-01T23:15:00Z", "2026-01-01T23:16:00Z"),
  );
  assert.match(problems(pr, known)[0], /CANCELLED/);
});

test("US-DEV-02: a pending latest run stops the merge although an older run was green", () => {
  const pr = withRuns(
    run("SUCCESS", "2026-01-01T23:10:00Z", "2026-01-01T23:11:00Z"),
    run("", "2026-01-01T23:15:00Z", "0001-01-01T00:00:00Z", "IN_PROGRESS"),
  );
  assert.equal(problems(pr, known).length, 1);
  assert.match(problems(pr, known)[0], /ci-status/);
});

test("US-DEV-02: other checks and a missing ci-status run do not count as green", () => {
  const other = withRuns({
    name: "lint",
    conclusion: "SUCCESS",
    startedAt: "2026-01-01T23:15:00Z",
  });
  assert.match(problems(other, known)[0], /not reported/);
});
