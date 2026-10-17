import { test } from "node:test";
import assert from "node:assert/strict";
import { compare } from "./check-coverage-ratchet.mjs";

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
