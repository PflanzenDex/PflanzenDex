// Tests for the fingerprint of the gate files (US-QG-07, issue 2554, second round): a change of content stops the next step,
// a touch does not, and a stored fingerprint that cannot be verified reads as null.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  changedPaths,
  loadFingerprint,
  storeFingerprint,
  takeFingerprint,
} from "./gate-fingerprint.mjs";
import { keyOf } from "./gate-seal.mjs";

const KEY = "c".repeat(64);

function repo(t) {
  const root = mkdtempSync(join(tmpdir(), "gate-fp-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, ".claude"), { recursive: true });
  writeFileSync(join(root, "Makefile"), "all:\n");
  writeFileSync(join(root, ".claude/rules.mjs"), "export {};\n");
  return root;
}

test("US-QG-07, issue 2554: a changed gate file is named by the fingerprint difference, an unchanged one is not, and a missing one is named as removed", (t) => {
  const root = repo(t);
  const paths = ["Makefile", ".claude/rules.mjs", "AGENTS.md"];
  const before = takeFingerprint(root, paths);
  assert.deepEqual(Object.keys(before).sort(), [".claude/rules.mjs", "Makefile"]);
  assert.deepEqual(changedPaths(before, takeFingerprint(root, paths, before)), []);
  writeFileSync(join(root, "Makefile"), "all:\nclean:\n");
  assert.deepEqual(changedPaths(before, takeFingerprint(root, paths, before)), ["Makefile"]);
  rmSync(join(root, ".claude/rules.mjs"));
  assert.deepEqual(changedPaths(before, takeFingerprint(root, paths, before)), [
    ".claude/rules.mjs",
    "Makefile",
  ]);
});

test("US-QG-07, issue 2554: a touch that keeps the content is no change, and an added gate file is named", (t) => {
  const root = repo(t);
  const before = takeFingerprint(root, ["Makefile", "AGENTS.md"]);
  utimesSync(join(root, "Makefile"), new Date(1000), new Date(1000));
  assert.deepEqual(
    changedPaths(before, takeFingerprint(root, ["Makefile", "AGENTS.md"], before)),
    [],
  );
  writeFileSync(join(root, "AGENTS.md"), "new\n");
  assert.deepEqual(changedPaths(before, takeFingerprint(root, ["Makefile", "AGENTS.md"], before)), [
    "AGENTS.md",
  ]);
});

test("US-QG-07, issue 2554: a stored fingerprint round-trips when its MAC matches, and reads as null when it does not", (t) => {
  const root = repo(t);
  const key = keyOf(root);
  const file = join(root, "state.json");
  const files = takeFingerprint(root, ["Makefile"]);
  storeFingerprint(file, key, files);
  assert.deepEqual(loadFingerprint(file, key), files);
  assert.equal(loadFingerprint(file, "d".repeat(64)), null, "another key");
  writeFileSync(file, '{"files":{}}\n');
  assert.equal(loadFingerprint(file, key), null, "a changed text");
  assert.equal(loadFingerprint(join(root, "none.json"), key), null, "no record");
});
