import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compareBaseline, toBaseline } from "./layout-baseline.mjs";

const f = (rule, dir, value, items = ["x"]) => ({ rule, dir, value, items });

describe("US-QG-09 LY-6 baseline ratchet", () => {
  it("toBaseline stores one value per rule and directory, sorted", () => {
    assert.deepEqual(toBaseline([f("LY-3", "b", 2), f("LY-1", "z", 7), f("LY-1", "a", 6)]), {
      "LY-1": { a: 6, z: 7 },
      "LY-3": { b: 2 },
    });
  });
  it("passes when findings match the baseline exactly", () => {
    assert.deepEqual(compareBaseline([f("LY-1", "a", 6)], { "LY-1": { a: 6 } }), []);
  });
  it("fails a violation that is not in the baseline", () => {
    const e = compareBaseline([f("LY-1", "a", 6)], {});
    assert.match(e[0], /^LY-1 a: 6 .*not allowed/);
  });
  it("fails a baselined directory that got worse", () => {
    assert.match(
      compareBaseline([f("LY-1", "a", 7)], { "LY-1": { a: 6 } })[0],
      /^LY-1 a: 7, baseline allows 6/,
    );
  });
  it("fails a stale entry: lower value or no longer violating", () => {
    assert.match(
      compareBaseline([f("LY-1", "a", 5)], { "LY-1": { a: 6 } })[0],
      /^LY-6 LY-1 a: now 5.*lower the entry/,
    );
    assert.match(
      compareBaseline([], { "LY-1": { a: 6 } })[0],
      /^LY-6 LY-1 a: no longer violates; delete the entry/,
    );
  });
  it("fails entries that are new or higher compared with dev", () => {
    const base = { "LY-1": { a: 6, b: 3 } };
    const findings = [f("LY-1", "a", 6), f("LY-1", "b", 3)];
    const e = compareBaseline(findings, base, { "LY-1": { a: 5 } });
    assert.equal(e.length, 2);
    assert.match(e[0], /a: 6 is higher than 5 on dev/);
    assert.match(e[1], /b: entry is not on dev/);
  });
  it("accepts a baseline that only shrank against dev", () => {
    assert.deepEqual(
      compareBaseline([f("LY-1", "a", 5)], { "LY-1": { a: 5 } }, { "LY-1": { a: 6, b: 3 } }),
      [],
    );
  });
});

describe("US-QG-09 every violation says what to do next", () => {
  const next = {
    "LY-1": /group the entries|declare a collection/,
    "LY-2": /name pattern/,
    "LY-3": /kebab-case/,
    "LY-4": /into a folder/,
    "LY-5": /app\/, docs\/ or tools\//,
  };
  for (const [rule, hint] of Object.entries(next)) {
    it(`${rule}: new violation and worse directory both carry a hint`, () => {
      assert.match(compareBaseline([f(rule, "a", 2)], {})[0], hint);
      assert.match(compareBaseline([f(rule, "a", 3)], { [rule]: { a: 2 } })[0], hint);
    });
  }
});
