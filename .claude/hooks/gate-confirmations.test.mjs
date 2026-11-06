// Tests for the record of confirmed gate files (US-QG-07): pure functions. The end-to-end tests through run.mjs are in
// worktree.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { needsQuestion, withConfirmation } from "./gate-confirmations.mjs";

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
