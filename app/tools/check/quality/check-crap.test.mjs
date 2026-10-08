import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_CRAP,
  readMaxCrap,
  mergeCoverage,
  fallowArgs,
  findOffenders,
  maxCrap,
  formatOffender,
  resolveBase,
} from "./check-crap.mjs";

const finding = (crap, extra = {}) => ({
  path: "a.ts",
  name: "f",
  line: 3,
  cyclomatic: 10,
  crap,
  coverage_source: "istanbul",
  coverage_pct: 40,
  ...extra,
});

test("a function exactly at the threshold passes, above it fails", () => {
  const r = { findings: [finding(MAX_CRAP), finding(MAX_CRAP + 0.1), finding(10)] };
  assert.deepEqual(
    findOffenders(r).map((f) => f.crap),
    [MAX_CRAP + 0.1],
  );
});

test("offenders are sorted worst first; empty report has no offenders", () => {
  const r = { findings: [finding(500), finding(900)] };
  assert.deepEqual(
    findOffenders(r).map((f) => f.crap),
    [900, 500],
  );
  assert.deepEqual(findOffenders({}), []);
});

test("a complex function without tests fails, the same one with full coverage passes", () => {
  const crap = (cc, cov) => cc ** 2 * (1 - cov) ** 3 + cc;
  assert.ok(crap(21, 0) > MAX_CRAP);
  assert.ok(crap(21, 1) <= MAX_CRAP);
});

test("maxCrap handles empty and filled reports", () => {
  assert.equal(maxCrap({ findings: [] }), 0);
  assert.equal(maxCrap({ findings: [finding(12), finding(40)] }), 40);
});

test("mergeCoverage unions maps of different packages", () => {
  assert.deepEqual(mergeCoverage([{ "/x/a.ts": 1 }, { "/x/b.ts": 2 }]), {
    "/x/a.ts": 1,
    "/x/b.ts": 2,
  });
});

test("fallowArgs adds coverage and diff scope only when given", () => {
  const plain = fallowArgs({});
  assert.ok(!plain.includes("--coverage") && !plain.includes("--changed-since"));
  const full = fallowArgs({ coverageDir: "/tmp/c", base: "origin/dev" });
  assert.equal(full[full.indexOf("--coverage") + 1], "/tmp/c");
  assert.equal(full[full.indexOf("--changed-since") + 1], "origin/dev");
});

test("formatOffender says whether coverage data was missing", () => {
  assert.match(formatOffender(finding(500)), /coverage 40%/);
  assert.match(formatOffender(finding(500, { coverage_source: "estimated" })), /no coverage data/);
});

test("resolveBase prefers the PR base branch, falls back to dev, and to null if absent", () => {
  assert.equal(
    resolveBase({ GITHUB_BASE_REF: "main" }, () => true),
    "origin/main",
  );
  assert.equal(
    resolveBase({}, () => true),
    "origin/dev",
  );
  assert.equal(
    resolveBase({}, () => false),
    null,
  );
});

test("the threshold is read from quality-limits.json", () => {
  assert.equal(typeof MAX_CRAP, "number");
  const file = new URL("../../../config/gates/quality-limits.json", import.meta.url);
  assert.equal(readMaxCrap(file), MAX_CRAP);
});
