import { test } from "node:test";
import assert from "node:assert/strict";
import { checkDup, biggest, TARGET_PERCENT } from "./check-dup.mjs";

const limits = { maxPercent: 1.65, slackPercent: 0.1 };

test("QG-K5 (issue 479): at or below the limit passes", () => {
  assert.deepEqual(checkDup(1.65, limits), []);
  assert.deepEqual(checkDup(1.6, limits), []);
});

test("QG-K5 (issue 479): above the limit fails with DUP-1", () => {
  const e = checkDup(1.7, limits);
  assert.equal(e.length, 1);
  assert.match(e[0], /^DUP-1 /);
});

test("QG-K5 (issue 479): clearly below the limit demands a lower limit (DUP-2)", () => {
  const e = checkDup(1.2, limits);
  assert.match(e[0], /^DUP-2 .* to 1\.2$/);
});

test("QG-K5 (issue 479): at the target the ratchet is finished, no DUP-2", () => {
  assert.deepEqual(checkDup(0.3, { maxPercent: TARGET_PERCENT, slackPercent: 0.1 }), []);
  assert.match(checkDup(0.3, { maxPercent: 0.5, slackPercent: 0.1 })[0], /^DUP-3 /);
});

test("QG-K5 (issue 479): biggest clones are listed largest first", () => {
  const f = (name, start) => ({ name, start });
  const report = {
    duplicates: [
      { lines: 5, firstFile: f("a.ts", 1), secondFile: f("b.ts", 2) },
      { lines: 30, firstFile: f("c.ts", 3), secondFile: f("d.ts", 4) },
    ],
  };
  const out = biggest(report, 1);
  assert.equal(out.length, 1);
  assert.match(out[0], /30 lines: c\.ts:3 <-> d\.ts:4/);
  assert.deepEqual(biggest({}), []);
});
