// FR-QG-03: ID references in the product specs must resolve
import test from "node:test";
import assert from "node:assert/strict";
import { findDanglingRefs } from "./check-spec-refs.mjs";

const defs =
  "### US-ACC-01 · Title\n| FR-ACC-01 | x |\n| NFR-18 | x |\n| E-05 | x |\n### DM-BES-01 Thing\n";

test("FR-QG-03: references to defined IDs of every family resolve", () => {
  const text = `${defs}See US-ACC-01, FR-ACC-01, NFR-18, E-05 and DM-BES-01.\n`;
  assert.deepEqual(findDanglingRefs({ "01-A.md": defs, "02-B.md": text }), []);
});

test("FR-QG-03: a dangling reference is reported with file and line", () => {
  const p = findDanglingRefs({ "01-A.md": defs, "02-B.md": "ok\nSee FR-ACC-99 and E-77.\n" });
  assert.equal(p.length, 2);
  assert.match(p[0], /02-B\.md:2: FR-ACC-99/);
  assert.match(p[1], /E-77/);
});

test("FR-QG-03: reserved MIG IDs, wildcards and foreign families are ignored", () => {
  const text = "US-MIG-01, FR-MIG-02, FR-QG-nn, P-01, AB-1, DS-12, NFR-MON-02, XFR-ACC-77\n";
  assert.deepEqual(findDanglingRefs({ "01-A.md": defs + text }), []);
});
