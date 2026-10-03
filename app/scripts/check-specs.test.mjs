// US-DEV-08: Nummernvergabe geschützt
import test from "node:test";
import assert from "node:assert/strict";
import { findProblems } from "./check-specs.mjs";

test("US-DEV-08: doppelte Dateinummer wird abgelehnt", () => {
  const p = findProblems({ "12-A.md": "", "12-B.md": "", "13-C.md": "" });
  assert.equal(p.length, 1);
  assert.match(p[0], /12/);
});

test("US-DEV-08: doppelte ID wird abgelehnt, einfache Verweise nicht", () => {
  const ok = findProblems({
    "01-A.md": "### US-ACC-01 · Titel\n| FR-ACC-01 | Text | ⬜ |\nSiehe US-ACC-01 und FR-ACC-01.\n",
  });
  assert.deepEqual(ok, []);
  const bad = findProblems({ "01-A.md": "| FR-ACC-01 | a |\n", "02-B.md": "| FR-ACC-01 | b |\n" });
  assert.equal(bad.length, 1);
  assert.match(bad[0], /FR-ACC-01/);
});

test("US-DEV-08: Entscheidungen E-nn werden geprüft", () => {
  assert.equal(findProblems({ "16-A.md": "| E-05 | x |\n| E-05 | y |\n" }).length, 1);
});
