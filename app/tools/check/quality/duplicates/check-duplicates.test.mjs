import { test } from "node:test";
import assert from "node:assert/strict";
import { fallowArgs, baseRef, cloneGroups, describe } from "./check-duplicates.mjs";

const limits = { minOccurrences: 3, minTokens: 50, minLines: 5, mode: "mild" };

test("QG-K4: thresholds from the config reach fallow", () => {
  const a = fallowArgs(limits, ["--fail-on-issues"]);
  assert.deepEqual(a.slice(0, 3), ["fallow", "dupes", "--min-occurrences"]);
  assert.equal(a[a.indexOf("--min-occurrences") + 1], "3");
  assert.equal(a[a.indexOf("--mode") + 1], "mild");
  assert.equal(a.at(-1), "--fail-on-issues");
});

test("QG-K4: base is the override, the PR base or origin/dev", () => {
  assert.equal(baseRef({ DUPLICATES_BASE: "x" }), "x");
  assert.equal(baseRef({ GITHUB_BASE_REF: "main" }), "origin/main");
  assert.equal(baseRef({}), "origin/dev");
});

test("QG-K4: clone groups are read from the JSON report", () => {
  const g = { line_count: 9, instances: [{ file: "a.ts", start_line: 1, end_line: 9 }] };
  assert.equal(cloneGroups(JSON.stringify({ clone_groups: [g] })).length, 1);
  assert.equal(cloneGroups("{}").length, 0);
  assert.deepEqual(describe([g]), ["  9 lines x1: a.ts:1-9"]);
});
