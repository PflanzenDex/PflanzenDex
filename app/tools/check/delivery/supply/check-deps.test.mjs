// US-DEV-08 (#394): stale or missing dependencies are reported before a tool fails with a confusing message
import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { depsFindings, stamp } from "./check-deps.mjs";

function app(t, { modules = true, lock = '{"a":1}' } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "deps-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  if (modules) mkdirSync(path.join(dir, "node_modules"));
  if (lock !== null) writeFileSync(path.join(dir, "package-lock.json"), lock);
  return dir;
}

test("US-DEV-08: missing node_modules is named", (t) => {
  assert.match(depsFindings(app(t, { modules: false }))[0], /node_modules missing/);
});

test("US-DEV-08: node_modules without a stamp asks for make setup", (t) => {
  assert.match(depsFindings(app(t))[0], /without a record of the lock file/);
});

test("US-DEV-08: a stamped install is up to date, a changed lock file makes it stale", (t) => {
  const dir = app(t);
  stamp(dir);
  assert.deepEqual(depsFindings(dir), []);
  writeFileSync(path.join(dir, "package-lock.json"), '{"a":2}');
  assert.match(depsFindings(dir)[0], /out of date.*make setup/);
});

test("US-DEV-08: without a lock file there is nothing to compare", (t) => {
  const dir = app(t, { lock: null });
  assert.deepEqual(depsFindings(dir), []);
  stamp(dir);
});
