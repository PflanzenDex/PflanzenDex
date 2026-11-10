// US-QG-04: spec traceability and consistency checks
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  parseStories,
  testedIds,
  traceability,
  checkCounters,
  unresolvedRefs,
  run,
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

// Fixture stories use the epic AAA, which no real spec defines, so they cannot hide a real story.
const done = { "01-AAA.md": "### US-AAA-01 · Title · ✅ neu\n" };

test("US-QG-04: a skipped or todo test title does not count as a test", () => {
  const ids = testedIds({
    "a.test.mjs":
      'it.skip("US-AAA-01 skipped", () => {});\ntest.todo("US-AAA-01 todo");\ndescribe.todo("US-AAA-02 group");\n',
  });
  assert.deepEqual([...ids], []);
});

test("US-QG-04: a focused test (.only) still counts as a test", () => {
  const ids = testedIds({ "a.test.mjs": 'it.only("US-AAA-01 focused", () => {});' });
  assert.deepEqual([...ids], ["US-AAA-01"]);
});

test("US-QG-04: test.skip(condition, reason) inside a test body does not stop the test from counting", () => {
  const ids = testedIds({
    "a.test.ts":
      'test("US-AAA-01 runs on one project", async (_fixtures, info) => {\n  test.skip(info.project.name !== "mobil", "phone only");\n});',
  });
  assert.deepEqual([...ids], ["US-AAA-01"]);
});

test("US-QG-04: a done story with one real test and one skipped test stays green", () => {
  const files = {
    "a.test.mjs": 'test("US-AAA-01 real", () => {});\nit.skip("US-AAA-01 skipped", () => {});\n',
  };
  assert.deepEqual(traceability(parseStories(done), testedIds(files)).errors, []);
});

test("US-QG-04: a done story named only by skipped or todo tests fails and says so", () => {
  const { errors } = traceability(parseStories(done), new Set(), new Set(["US-AAA-01"]));
  assert.equal(errors.length, 1);
  assert.match(errors[0], /US-AAA-01/);
  assert.match(errors[0], /skipped or todo/);
});

function fixtureRepo(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "us-qg-04-"));
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  }
  return root;
}

test("US-QG-04: the gate fails a done story whose only test is skipped or todo", () => {
  const root = fixtureRepo({
    "docs/specs/product/01-aaa.md": "### US-AAA-01 · Title · ✅ neu\n",
    "app/packages/x/src/a.test.ts": 'it.skip("US-AAA-01 skipped", () => {});\n',
  });
  try {
    const { errors } = run(root);
    assert.ok(
      errors.some((e) => /story US-AAA-01 is done/.test(e)),
      `expected a US-AAA-01 error, got: ${errors.join(" | ")}`,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("US-QG-04: the gate accepts a done story with a runnable test next to a skipped one", () => {
  const root = fixtureRepo({
    "docs/specs/product/01-aaa.md": "### US-AAA-01 · Title · ✅ neu\n",
    "app/packages/x/src/a.test.ts":
      'test("US-AAA-01 real", () => {});\nit.skip("US-AAA-01 skipped", () => {});\n',
  });
  try {
    const { errors } = run(root);
    assert.deepEqual(
      errors.filter((e) => /US-AAA-01/.test(e)),
      [],
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
