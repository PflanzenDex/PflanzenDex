// Tests for the records of gate files (US-QG-07): pure functions. The end-to-end tests through run.mjs and gate-plan.mjs are
// in worktree.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  needsQuestion,
  normalizePaths,
  parsePlan,
  planWith,
  plannedFiles,
  questionFiles,
  snapshotList,
  snapshotText,
  withConfirmation,
  withConfirmations,
} from "./gate-confirmations.mjs";

const A = "refs/heads/chore/x";
const B = "refs/heads/chore/y";

test("US-QG-07: a gate file asks until an edit of it is recorded as confirmed on its branch", () => {
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

test("US-QG-07: a question about a planned file names every planned file that is not confirmed yet, the file included", () => {
  const planned = [".githooks/pre-commit", "Makefile", "app/eslint.config.js"];
  const confirmed = withConfirmation(null, A, "app/eslint.config.js");
  assert.deepEqual(questionFiles("Makefile", planned, confirmed, A), [".githooks/pre-commit", "Makefile"]);
  assert.deepEqual(questionFiles("Makefile", planned, null, A), planned);
});

test("US-QG-07: a question about a file outside the plan, with no plan or an unusable one, names the file alone", () => {
  assert.deepEqual(questionFiles(".githooks/pre-commit", ["Makefile"], null, A), [".githooks/pre-commit"]);
  assert.deepEqual(questionFiles("Makefile", null, null, A), ["Makefile"]);
  assert.deepEqual(questionFiles("Makefile", [], null, A), ["Makefile"]);
});

test("US-QG-07: an answer confirms the list of the snapshot of its own question, for its own file and branch", () => {
  const list = [".githooks/pre-commit", "Makefile"];
  const text = snapshotText(A, "Makefile", list);
  assert.deepEqual(snapshotList(text, A, "Makefile"), list);
  assert.equal(snapshotList(text, A, ".githooks/pre-commit"), null);
  assert.equal(snapshotList(text, B, "Makefile"), null);
  assert.deepEqual(JSON.parse(withConfirmations(null, A, snapshotList(text, A, "Makefile"))), { [A]: list });
});

test("US-QG-07: a snapshot that is missing, unreadable, names another file, or lists a non-gate file confirms nothing", () => {
  const unusable = [
    null,
    "",
    "{",
    "[]",
    "42",
    JSON.stringify({ branch: A, file: "Makefile", list: ["README.md", "Makefile"] }),
    JSON.stringify({ branch: A, file: "Makefile", list: [".githooks/pre-commit"] }),
    JSON.stringify({ branch: A, file: "Makefile" }),
  ];
  for (const text of unusable) assert.equal(snapshotList(text, A, "Makefile"), null, JSON.stringify(text));
});

test("US-QG-07: the answer confirms the list the question showed, not the plan as it is later", () => {
  const shown = snapshotText(A, "Makefile", [".githooks/pre-commit", "Makefile"]);
  const later = [".githooks/pre-commit", "Makefile", ".github/CODEOWNERS"];
  const confirmed = withConfirmations(null, A, snapshotList(shown, A, "Makefile"));
  assert.equal(needsQuestion(".github/CODEOWNERS", A, confirmed), true);
  assert.deepEqual(questionFiles(".github/CODEOWNERS", later, confirmed, A), [".github/CODEOWNERS"]);
});

test("US-QG-07: planWith records the gate files of a branch sorted and unique, keeps the other branches, and refuses what is not a gate file", () => {
  const text = planWith(JSON.stringify({ [B]: ["Makefile"] }), A, ["Makefile", ".githooks/pre-commit", "Makefile"]);
  assert.deepEqual(JSON.parse(text), { [B]: ["Makefile"], [A]: [".githooks/pre-commit", "Makefile"] });
  assert.throws(() => planWith(null, A, ["README.md", "Makefile"]), /not a gate file: README\.md/);
  assert.throws(() => planWith(null, A, normalizePaths(["../Makefile"])), /not a gate file: \.\.\/Makefile/);
  assert.throws(() => planWith(null, A, []), /no gate file is named/);
  assert.deepEqual(JSON.parse(planWith("{", A, ["Makefile"])), { [A]: ["Makefile"] });
});

test("US-QG-07: normalizePaths drops a leading ./ and collapses doubled slashes", () => {
  assert.deepEqual(normalizePaths(["./Makefile", "app//tools/check/quality/gates/run-gates.mjs"]), [
    "Makefile",
    "app/tools/check/quality/gates/run-gates.mjs",
  ]);
});
