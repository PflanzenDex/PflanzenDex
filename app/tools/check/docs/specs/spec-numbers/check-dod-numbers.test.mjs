import test from "node:test";
import assert from "node:assert/strict";
import { findMarkers, findProblems } from "./check-dod-numbers.mjs";

const configs = {
  "layout.config.mjs": { default: { maxUnits: 5 } },
  "quality-limits.json": { default: { maxLines: 200 } },
};
const doc = (text) => ({ "DOD.md": text });

test("FR-QG-18 a marked number equal to the config passes", () => {
  const text =
    "at most 5 <!-- gate: layout.config.mjs#default.maxUnits --> units per directory\n≤ 200 <!-- gate: quality-limits.json#default.maxLines --> lines\n";
  assert.deepEqual(findProblems(doc(text), configs), []);
});

test("FR-QG-18 coverage >= 70 % without a marker fails (DN-1, PF-003)", () => {
  const [p, ...rest] = findProblems(doc("ok\n- coverage ≥ 70 % in every package\n"), configs);
  assert.equal(rest.length, 0);
  assert.match(p, /DOD\.md:2/);
  assert.match(p, /DN-1/);
  assert.match(p, /70/);
});

test("FR-QG-18 a threshold word with an unmarked number fails (DN-1), IDs and plain prose do not", () => {
  assert.equal(findProblems(doc("at most 5 units per directory\n"), configs).length, 1);
  assert.deepEqual(findProblems(doc("see FR-QG-21 and (P-04), 3 steps in a row\n"), configs), []);
});

test("FR-QG-18 a marked number that differs from the config fails (DN-2)", () => {
  const [p] = findProblems(
    doc("≤ 70 <!-- gate: quality-limits.json#default.maxLines --> lines\n"),
    configs,
  );
  assert.match(p, /DOD\.md:1/);
  assert.match(p, /DN-2/);
  assert.match(p, /says 70/);
  assert.match(p, /is 200/);
});

test("FR-QG-18 a marker naming a missing path or file fails (DN-3)", () => {
  const text = "5 <!-- gate: layout.config.mjs#default.gone -->\n5 <!-- gate: nothing.json#a -->\n";
  const problems = findProblems(doc(text), configs);
  assert.equal(problems.length, 2);
  problems.forEach((p) => assert.match(p, /DN-3/));
});

test("FR-QG-18 markers and numbers in code spans are ignored", () => {
  const text =
    "write `5 <!-- gate: layout.config.mjs#default.gone -->` and `coverage 70 %` as example\n";
  assert.deepEqual(findMarkers(doc(text)), []);
  assert.deepEqual(findProblems(doc(text), configs), []);
});
