import test from "node:test";
import assert from "node:assert/strict";
import {
  areaRows,
  countByStoryId,
  parseStatuses,
  storyRows,
  testTitles,
} from "./story-tests-lib.mjs";
import { render } from "./report-story-tests.mjs";

const SPEC = {
  "a.md": [
    "### US-AAA-01 · Done story · ✅ (prototype ✅)",
    "### US-AAA-02 · Open story · ⬜ (prototype new)",
    "### US-AAA-03 · Partial story · 🟨 (prototype 🟡)",
    "| FR-AAA-01 | Requirement text | 🟨 Details here |",
    "| **NFR-08** | Time zones | ✅ |",
    "| FR-AAA-02 | Planned | ⬜ |",
  ].join("\n"),
};

test("US-QS-02: spec status line is parsed for stories and requirement rows", () => {
  const got = Object.fromEntries(parseStatuses(SPEC).map((i) => [i.id, i.status]));
  assert.deepEqual(got, {
    "US-AAA-01": "✅",
    "US-AAA-02": "⬜",
    "US-AAA-03": "🟨",
    "FR-AAA-01": "🟨",
    "NFR-08": "✅",
    "FR-AAA-02": "⬜",
  });
});

test("US-QS-02: test titles are scanned for describe, it and test with any quote", () => {
  const text = `describe("US-AAA-01 group", () => { it('works (FR-AAA-01)', () => {}); test.skip(\`x \\\`y\`, f); });`;
  assert.deepEqual(
    testTitles(text).map((t) => t.kind),
    ["describe", "it", "test"],
  );
  assert.equal(testTitles(text)[1].title, "works (FR-AAA-01)");
});

test("US-QS-02: counts tests per ID, once per title, ignoring IDs outside titles", () => {
  const files = {
    "x.test.ts": `it("US-AAA-01 a", f); it("US-AAA-01 and US-AAA-01 b", f); it("NFR-08 c", f); // US-AAA-03`,
  };
  const c = countByStoryId(files);
  assert.equal(c.get("US-AAA-01"), 2);
  assert.equal(c.get("NFR-08"), 1);
  assert.equal(c.get("US-AAA-03"), undefined);
});

test("US-QS-02: done items without a test are flagged, planned ones are left out", () => {
  const items = parseStatuses(SPEC);
  const { rows, missing } = storyRows(items, new Map([["US-AAA-01", 2]]));
  assert.deepEqual(
    rows.map((r) => r.id),
    ["FR-AAA-01", "NFR-08", "US-AAA-01", "US-AAA-03"],
  );
  assert.deepEqual(
    missing.map((m) => m.id),
    ["NFR-08"],
  );
});

test("US-QS-02: areas count sources and test cases, an area without files is not yet", () => {
  const files = {
    "/rank/rank.ts": "export const x = 1;",
    "/rank/rank.test.ts": `describe("US-POK-10", () => { it("a", f); it("US-POK-10 b", f); });`,
  };
  const areas = [
    { name: "Rank", match: /\/rank\// },
    { name: "Feed", match: /feed/ },
  ];
  const [rank, feed] = areaRows(areas, files);
  assert.deepEqual([rank.sources.length, rank.tests, rank.cases, rank.named], [1, 1, 2, 1]);
  assert.equal(feed.sources.length, 0);
  const md = render({ rows: [], missing: [] }, [rank, feed]);
  assert.match(md, /\| Rank \| 1 \| 1 \| 2 \| 1 \| exists \|/);
  assert.match(md, /\| Feed \| 0 \| 0 \| 0 \| 0 \| not yet \|/);
});
