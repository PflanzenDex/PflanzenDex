// US-QG-04: spec traceability and consistency checks
import test from "node:test";
import assert from "node:assert/strict";
import {
  parseStories,
  testedIds,
  traceability,
  checkCounters,
  unresolvedRefs,
} from "./check-traceability.mjs";

const spec = {
  "01-A.md":
    "### US-ACC-01 · Title · ✅ neu\n### US-ACC-02 · Title · ⬜ neu\n### US-BES-01 · T · ⬜ (Prototyp ✅)\n",
};

test("US-QG-04: stories and status are parsed, prototype marker is not the status", () => {
  const s = parseStories(spec);
  assert.deepEqual(
    s.map((x) => [x.id, x.status]),
    [
      ["US-ACC-01", "✅"],
      ["US-ACC-02", "⬜"],
      ["US-BES-01", "⬜"],
    ],
  );
});

test("US-QG-04: test titles from describe/it/test are collected", () => {
  const ids = testedIds({
    "a.test.ts": 'describe("US-ACC-01: x", () => { it(`US-BES-01 works`, () => {}); });',
    "b.test.mjs": "test('US-ACC-02: y', () => {}); // US-ZZZ-99 only in a comment",
  });
  assert.deepEqual([...ids].sort(), ["US-ACC-01", "US-ACC-02", "US-BES-01"]);
});

test("US-QG-04: a done story without a test is an error naming ID and file", () => {
  const { errors } = traceability(parseStories(spec), new Set());
  assert.equal(errors.length, 1);
  assert.match(errors[0], /US-ACC-01/);
  assert.match(errors[0], /01-A\.md/);
  assert.deepEqual(traceability(parseStories(spec), new Set(["US-ACC-01"])).errors, []);
});

test("US-QG-04: unknown or open story IDs in tests are hints, not errors", () => {
  const r = traceability(parseStories(spec), new Set(["US-ACC-01", "US-ACC-02", "US-XXX-01"]));
  assert.deepEqual(r.errors, []);
  assert.equal(r.hints.length, 2);
});

test("US-QG-04: README counters must match the story count per epic", () => {
  const stories = parseStories(spec);
  const table = (acc, bes, sum) =>
    `| Epic | Stories |\n| --- | --- |\n| ACC Konten | ${acc} | 0 |\n| BES Bestand | ${bes} | 1 |\n| **Summe** | **${sum}** | x |\n`;
  assert.deepEqual(checkCounters(table(2, 1, 3), stories), []);
  const bad = checkCounters(table(3, 1, 3), stories);
  assert.equal(bad.length, 1);
  assert.match(bad[0], /ACC/);
  assert.equal(checkCounters(table(2, 1, 9), stories).length, 1);
});

test("US-QG-04: references to undefined IDs are reported", () => {
  const refs = unresolvedRefs({
    "a.md": "### US-ACC-01 · T · ⬜\n| FR-ACC-01 | see US-ACC-01, FR-ACC-09 and E-77 |\n",
  });
  assert.equal(refs.length, 2);
});
