// Pure logic of the story-to-test report (US-QS-02, US-QG-04). No I/O: callers pass file texts.
import { parseStories } from "../../../docs/check-traceability.mjs";

const ID = "(?:US|FR|DM)-[A-Z]+-\\d+|NFR-\\d+";
const STATUS = /^(⬜|🟨|✅)/u;
const CALL = /\b(describe|it|test)(?:\.(?:only|skip|todo))?\(\s*(["'`])/g;

/** Stories (headings) and requirements (table rows, last cell starts with the status) with their status. */
export function parseStatuses(specFiles) {
  const items = parseStories(specFiles).map((s) => ({ id: s.id, status: s.status, file: s.file }));
  const seen = new Set(items.map((i) => i.id));
  for (const [file, text] of Object.entries(specFiles))
    for (const line of text.split("\n")) {
      const cells = line.split("|").map((c) => c.trim());
      const id = cells[1]?.replace(/\*/g, "").match(new RegExp(`^(${ID})$`))?.[1];
      const status = cells
        .slice(2)
        .findLast((c) => STATUS.test(c))
        ?.match(STATUS)?.[1];
      if (id && status && !seen.has(id)) {
        seen.add(id);
        items.push({ id, status, file: file.split("/").pop() });
      }
    }
  return items;
}

/** Titles of describe/it/test calls with their kind, from one test file. */
export function testTitles(text) {
  const out = [];
  for (const m of text.matchAll(CALL)) {
    let end = m.index + m[0].length;
    const start = end;
    while (end < text.length && text[end] !== m[2]) end += text[end] === "\\" ? 2 : 1;
    out.push({ kind: m[1], title: text.slice(start, end) });
  }
  return out;
}

/** ID -> number of describe/it/test titles that carry it, over all test files. */
export function countByStoryId(testFiles) {
  const counts = new Map();
  for (const text of Object.values(testFiles))
    for (const { title } of testTitles(text))
      for (const id of new Set(title.match(new RegExp(`\\b(?:${ID})\\b`, "g")) ?? []))
        counts.set(id, (counts.get(id) ?? 0) + 1);
  return counts;
}

/** Rows for every ✅ or 🟨 item; `missing` lists the ✅ ones without a test. */
export function storyRows(items, counts) {
  const rows = items
    .filter((i) => i.status !== "⬜")
    .map((i) => ({ ...i, tests: counts.get(i.id) ?? 0 }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return { rows, missing: rows.filter((r) => r.status === "✅" && r.tests === 0) };
}

/** Pure-logic areas of US-QS-02 criterion 1 with test counts; an area without source files is "not yet". */
export function areaRows(areas, coreFiles) {
  const isTest = (p) => /\.test\.ts$/.test(p);
  return areas.map((a) => {
    const paths = Object.keys(coreFiles).filter((p) => a.match.test(p));
    const sources = paths.filter((p) => !isTest(p));
    const tests = paths.filter(isTest);
    const cases = tests
      .flatMap((p) => testTitles(coreFiles[p]))
      .filter((t) => t.kind !== "describe");
    const named = cases.filter((t) => new RegExp(`\\b(?:${ID})\\b`).test(t.title));
    return { name: a.name, sources, tests: tests.length, cases: cases.length, named: named.length };
  });
}
