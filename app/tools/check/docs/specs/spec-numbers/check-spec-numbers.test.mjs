import test from "node:test";
import assert from "node:assert/strict";
import { findMarkers, findProblems, parseSpecNumber } from "./check-spec-numbers.mjs";

const constants = {
  REPLENISH_BUFFER_LIMITS: { min: 0, max: 10, default: 3 },
  GROWTH_DEFAULTS: { trendTolerance: 0.1 },
  RANKS: [{ from: 0 }, { from: 5 }],
};
const spec = (text) => ({ "07-fixture.md": text });

test("FR-QG-13 a spec number that equals the code constant passes", () => {
  const text = "- at least **3** <!-- const: REPLENISH_BUFFER_LIMITS.default --> open candidates\n";
  assert.deepEqual(findProblems(spec(text), constants, []), []);
});

test("FR-QG-13 spec says buffer 2, code default is 3: fails and names both places (SN-1)", () => {
  const text = "line\n- buffer 2 <!-- const: REPLENISH_BUFFER_LIMITS.default -->\n";
  const [problem, ...rest] = findProblems(spec(text), constants, []);
  assert.equal(rest.length, 0);
  assert.match(problem, /07-fixture\.md:2/);
  assert.match(problem, /SN-1/);
  assert.match(problem, /spec says 2/);
  assert.match(problem, /REPLENISH_BUFFER_LIMITS\.default is 3/);
});

test("FR-QG-13 a marker naming a missing constant or path fails (SN-2)", () => {
  const text = "5 <!-- const: GONE.value -->\n5 <!-- const: GROWTH_DEFAULTS.nothing -->\n";
  const problems = findProblems(spec(text), constants, []);
  assert.equal(problems.length, 2);
  assert.ok(problems.every((p) => p.includes("SN-2")));
});

test("FR-QG-13 a marker without a number before it fails (SN-3)", () => {
  const problems = findProblems(
    spec("buffer <!-- const: GROWTH_DEFAULTS.trendTolerance -->\n"),
    constants,
    [],
  );
  assert.match(problems[0], /SN-3/);
});

test("FR-QG-13 a registered constant whose marker is gone fails (SN-4)", () => {
  const problems = findProblems(spec("no marker here 2\n"), constants, [
    "REPLENISH_BUFFER_LIMITS.default",
  ]);
  assert.match(problems[0], /SN-4 REPLENISH_BUFFER_LIMITS\.default/);
});

test("FR-QG-13 scale=100 compares a percent in the spec with a fraction in the code", () => {
  const ok = "trend ±10 % <!-- const: GROWTH_DEFAULTS.trendTolerance scale=100 -->\n";
  assert.deepEqual(findProblems(spec(ok), constants, []), []);
  const bad = "trend ±15 % <!-- const: GROWTH_DEFAULTS.trendTolerance scale=100 -->\n";
  assert.match(findProblems(spec(bad), constants, [])[0], /SN-1/);
  const unscaled = "trend 10 % <!-- const: GROWTH_DEFAULTS.trendTolerance -->\n";
  assert.match(findProblems(spec(unscaled), constants, [])[0], /SN-1/);
});

test("FR-QG-13 number forms and array paths are read", () => {
  assert.equal(parseSpecNumber("up to 200,000 "), 200000);
  assert.equal(parseSpecNumber("every 30 days "), 30);
  assert.equal(parseSpecNumber("share 0.1 "), 0.1);
  assert.equal(parseSpecNumber("±10 % "), 10);
  assert.equal(parseSpecNumber("**2** "), 2);
  const text = "Sapling from 5 <!-- const: RANKS.1.from -->\n";
  assert.equal(findMarkers(spec(text))[0].value, 5);
  assert.deepEqual(findProblems(spec(text), constants, ["RANKS.1.from"]), []);
});

test("FR-QG-13 a marker shown as an example inside a code span is not a marker", () => {
  const text = "Write `2 <!-- const: NOT.THERE -->` after a number.\n";
  assert.deepEqual(findProblems(spec(text), constants, []), []);
});
