// Tests for the records of gate files (US-QG-07): pure functions. The end-to-end tests through run.mjs, gate-plan.mjs and
// gate-allow.mjs are in worktree.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  needsQuestion,
  normalizePaths,
  parsePlan,
  planWith,
  plannedFiles,
  unconfirmedChanged,
  withConfirmation,
  withConfirmations,
} from "./gate-confirmations.mjs";

const A = "refs/heads/chore/x";
const B = "refs/heads/chore/y";

test("US-QG-07, issue 2554: a gate file asks until it is confirmed on its branch by the owner's allow", () => {
  assert.equal(needsQuestion("Makefile", A, null), true);
  assert.equal(needsQuestion("Makefile", A, "{}"), true);
  const text = withConfirmation(null, A, "Makefile");
  assert.equal(needsQuestion("Makefile", A, text), false);
});

test("US-QG-07: a confirmation covers its own file on its own branch only", () => {
  const text = withConfirmation(null, A, "Makefile");
  assert.equal(needsQuestion(".githooks/pre-commit", A, text), true);
  assert.equal(needsQuestion("Makefile", B, text), true);
});

test("US-QG-07: without a branch (a detached HEAD) every gate file asks, even one recorded on a branch", () => {
  const text = withConfirmation(null, A, "Makefile");
  assert.equal(needsQuestion("Makefile", null, text), true);
  assert.equal(needsQuestion("Makefile", null, null), true);
});

test("US-QG-07: a record that is missing, unreadable or not in the expected shape asks for every gate file (fail closed)", () => {
  const unusable = [
    "",
    "{",
    "null",
    "[]",
    '"Makefile"',
    "42",
    `{"${A}": "Makefile"}`,
    `{"${A}": [1]}`,
    `{"${A}": ["Makefile", null]}`,
    `{"${A}": ["Makefile"], "${B}": 3}`,
  ];
  for (const text of [null, ...unusable]) {
    assert.equal(needsQuestion("Makefile", A, text), true, JSON.stringify(text));
  }
});

test("US-QG-07: recording a confirmation keeps the other entries, sorts the files and does nothing new when repeated", () => {
  const before = JSON.stringify({ [A]: ["x.json"], [B]: ["Makefile"] });
  const after = withConfirmation(before, A, "Makefile");
  assert.deepEqual(JSON.parse(after), { [A]: ["Makefile", "x.json"], [B]: ["Makefile"] });
  assert.equal(withConfirmation(after, A, "Makefile"), after);
});

test("US-QG-07: recording over a malformed record starts a new record with the confirmed file only", () => {
  assert.deepEqual(JSON.parse(withConfirmation("{", A, "Makefile")), { [A]: ["Makefile"] });
});

test("US-QG-07: gate-allow records every named file of its list on the branch, and keeps the rest", () => {
  const text = withConfirmations(JSON.stringify({ [B]: ["Makefile"] }), A, [
    ".githooks/pre-commit",
    "Makefile",
  ]);
  assert.deepEqual(JSON.parse(text), {
    [B]: ["Makefile"],
    [A]: [".githooks/pre-commit", "Makefile"],
  });
  assert.equal(needsQuestion("Makefile", A, text), false);
  assert.equal(needsQuestion("Makefile", B, text), false);
});

test("US-QG-07: a plan lists only gate files; a plan that is missing, malformed or names a non-gate path is unusable", () => {
  assert.deepEqual(parsePlan(JSON.stringify({ [A]: ["Makefile", ".githooks/pre-commit"] })), {
    [A]: ["Makefile", ".githooks/pre-commit"],
  });
  const unusable = [
    null,
    "",
    "{",
    "[]",
    `{"${A}": "Makefile"}`,
    `{"${A}": ["README.md"]}`,
    `{"${A}": ["../Makefile"]}`,
    `{"${A}": [1]}`,
  ];
  for (const text of unusable) assert.equal(parsePlan(text), null, JSON.stringify(text));
});

test("US-QG-07: the planned files of a branch are its list, none without an entry, and null when the plan is unusable", () => {
  const plan = JSON.stringify({ [A]: ["Makefile"] });
  assert.deepEqual(plannedFiles(plan, A), ["Makefile"]);
  assert.deepEqual(plannedFiles(plan, B), []);
  assert.equal(plannedFiles("{", A), null);
  assert.equal(plannedFiles(null, A), null);
});

test("US-QG-07, issue 2554: a listed gate file that already differs from origin/dev and has no confirmation is named; the others pass", () => {
  const differs = new Set([
    "Makefile",
    ".githooks/pre-commit",
    "AGENTS.md",
    ".claude/hooks/rules.test.mjs",
  ]);
  const confirmed = withConfirmation(null, A, "AGENTS.md");
  const files = ["Makefile", ".githooks/pre-commit", "AGENTS.md", ".claude/hooks/rules.test.mjs"];
  // AGENTS.md differs but is confirmed; the gate test asks nothing; the Makefile and the hook differ and are not confirmed.
  assert.deepEqual(
    unconfirmedChanged(files, (f) => differs.has(f), confirmed, A),
    ["Makefile", ".githooks/pre-commit"],
  );
  assert.deepEqual(
    unconfirmedChanged(files, () => false, null, A),
    [],
  );
  assert.deepEqual(
    unconfirmedChanged(["Makefile"], () => true, null, B),
    ["Makefile"],
  );
});

test("US-QG-07, issue 2554: a file that is confirmed or unchanged is never asked about, and the change is looked at only for a file that asks", () => {
  const seen = [];
  const differs = (f) => {
    seen.push(f);
    return true;
  };
  const confirmed = withConfirmation(null, A, "Makefile");
  assert.deepEqual(unconfirmedChanged(["Makefile"], differs, confirmed, A), []);
  assert.deepEqual(unconfirmedChanged([".claude/hooks/rules.test.mjs"], differs, null, A), []);
  assert.deepEqual(seen, []);
});

test("US-QG-07: planWith records the gate files of a branch sorted and unique, keeps the other branches, and refuses what is not a gate file", () => {
  const text = planWith(JSON.stringify({ [B]: ["Makefile"] }), A, [
    "Makefile",
    ".githooks/pre-commit",
    "Makefile",
  ]);
  assert.deepEqual(JSON.parse(text), {
    [B]: ["Makefile"],
    [A]: [".githooks/pre-commit", "Makefile"],
  });
  assert.throws(() => planWith(null, A, ["README.md", "Makefile"]), /not a gate file: README\.md/);
  assert.throws(
    () => planWith(null, A, normalizePaths(["../Makefile"])),
    /not a gate file: \.\.\/Makefile/,
  );
  assert.throws(() => planWith(null, A, []), /no gate file is named/);
  assert.deepEqual(JSON.parse(planWith("{", A, ["Makefile"])), { [A]: ["Makefile"] });
});

test("US-QG-07: normalizePaths drops a leading ./ and collapses doubled slashes", () => {
  assert.deepEqual(normalizePaths(["./Makefile", "app//tools/check/quality/gates/run-gates.mjs"]), [
    "Makefile",
    "app/tools/check/quality/gates/run-gates.mjs",
  ]);
});
