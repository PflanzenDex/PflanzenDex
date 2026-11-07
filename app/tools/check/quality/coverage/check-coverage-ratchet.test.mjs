import { test } from "node:test";
import assert from "node:assert/strict";
import { compare } from "./check-coverage-ratchet.mjs";
import { unmeasuredFrom } from "./coverage-config.mjs";

const limits = { lines: 90, branches: 80, functions: 80, statements: 90 };
const total = (l, b = 80, f = 80, s = 90) => ({
  lines: { pct: l },
  branches: { pct: b },
  functions: { pct: f },
  statements: { pct: s },
});

test("passes when all values are at or above the thresholds", () => {
  const r = compare({ core: limits }, { core: total(90) });
  assert.deepEqual(r, { failures: [], hints: [], notes: [] });
});

test("fails when a value dropped below its threshold", () => {
  const r = compare({ core: limits }, { core: total(89.9) });
  assert.equal(r.failures.length, 1);
  assert.match(r.failures[0], /core: lines 89.9% is below the threshold 90%/);
});

test("hints to raise when a value is 2 or more points above, without failing", () => {
  const r = compare({ core: limits }, { core: total(95.5) });
  assert.equal(r.failures.length, 0);
  assert.deepEqual(r.hints, ["core: lines is 95.5%, raise the threshold 90 to 95"]);
});

test("no hint for a gap below 2 points", () => {
  assert.deepEqual(compare({ core: limits }, { core: total(91.9) }).hints, []);
});

test("missing summary fails, unmeasured package (null thresholds) is only a note", () => {
  const r = compare({ core: limits, db: null }, { core: null, db: null });
  assert.equal(r.failures.length, 1);
  assert.match(r.failures[0], /core: no coverage summary/);
  assert.equal(r.notes.length, 1);
});

test("a missing metric in the summary fails", () => {
  const r = compare({ core: limits }, { core: { lines: { pct: 99 } } });
  assert.equal(r.failures.length, 3);
});

test("US-QG-02: a package named as unmeasured is left out, and a dropped value of another package still fails", () => {
  const thresholds = { core: limits, web: limits };
  const left = compare(thresholds, { core: total(90), web: null }, ["web"]);
  assert.deepEqual(left.failures, []);
  assert.match(left.notes[0], /^web: left out, its tests did not run in this CI run/);
  const dropped = compare(thresholds, { core: { lines: { pct: 99 } }, web: null }, ["web"]);
  assert.equal(dropped.failures.length, 3);
  assert.ok(dropped.failures.every((line) => line.startsWith("core: ")));
  const missing = compare(thresholds, { core: null, web: null }, ["web"]);
  assert.match(missing.failures[0], /^core: no coverage summary found/);
});

test("US-QG-02: without the input a missing web summary fails, as before", () => {
  const r = compare({ core: limits, web: limits }, { core: total(90), web: null });
  assert.deepEqual(r.failures, [
    "web: no coverage summary found (run the tests with coverage first)",
  ]);
});

test("US-QG-02: the input names only known packages; an unknown name fails, an empty value names none", () => {
  const known = ["core", "api", "web", "db"];
  assert.deepEqual(unmeasuredFrom("web", known), ["web"]);
  assert.deepEqual(unmeasuredFrom(" web, db ", known), ["web", "db"]);
  assert.deepEqual(unmeasuredFrom("", known), []);
  assert.deepEqual(unmeasuredFrom(undefined, known), []);
  assert.throws(
    () => unmeasuredFrom("webb", known),
    /COVERAGE_UNMEASURED names an unknown package: webb \(known: core, api, web, db\)/,
  );
  assert.throws(() => unmeasuredFrom("web,nope", known), /unknown package: nope/);
});

test("US-QG-02: by default the known packages are the ones of coverage-thresholds.json", () => {
  assert.deepEqual(unmeasuredFrom("web"), ["web"]);
  assert.throws(() => unmeasuredFrom("tools"), /unknown package: tools/);
});
