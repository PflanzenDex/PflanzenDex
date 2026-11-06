import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readRegister } from "./check-principles.mjs";
import { reviewRows, reviewToMarkdown } from "./check-principles-review.mjs";

const NOW = "2026-11-06";

// A register entry as a file: frontmatter, then the sections; `evidence` adds an Evidence section when given.
const file = (id, { maturity, blocking_from, evidence }) => {
  const meta = [
    "---",
    `id: ${id}`,
    `title: Principle ${id}`,
    `maturity: ${maturity}`,
    "spec: [P-02]",
    ...(blocking_from ? [`blocking_from: ${blocking_from}`] : []),
    "---",
    "",
    "## Why it is better\nx\n",
    "## How it is measured\nx\n",
    "## Checked by\n`app/ok.mjs`\n",
    "## Gate\n`make gates`\n",
  ];
  if (evidence !== undefined) meta.push(`## Evidence\n${evidence}\n`);
  return meta.join("\n");
};

// PRIN-001 and PRIN-005 are caught inside the window (PRIN-005 exactly on its first day); PRIN-004 and PRIN-007 are
// not reviewed (observed, measurable); PRIN-008 has an old and a recent catch, the newer one counts.
const fixture = {
  "prin-001-a.md": file("PRIN-001", {
    maturity: "gated",
    evidence: "Caught: 2026-10-20, PR #1269, a lookup per row.",
  }),
  "prin-002-a.md": file("PRIN-002", {
    maturity: "gated",
    evidence: "Caught: 2026-05-01, PR #900, an old catch.",
  }),
  "prin-003-a.md": file("PRIN-003", { maturity: "checked", blocking_from: "2026-12-01" }),
  "prin-004-a.md": file("PRIN-004", { maturity: "observed" }),
  "prin-005-a.md": file("PRIN-005", {
    maturity: "gated",
    evidence: "Caught: 2026-08-06, PR #1, first day of the window.",
  }),
  "prin-006-a.md": file("PRIN-006", {
    maturity: "gated",
    evidence: "Caught: 2026-08-05, PR #2, the day before the window.",
  }),
  "prin-007-a.md": file("PRIN-007", { maturity: "measurable" }),
  "prin-008-a.md": file("PRIN-008", {
    maturity: "gated",
    evidence: "Caught: 2026-02-01, PR #3, old.\nCaught: 2026-09-01, PR #4, recent.",
  }),
};

test("US-QG-06: the review lists gated and checked entries without a Caught line of the last three months", () => {
  const r = reviewRows(fixture, NOW);
  assert.equal(r.cutoff, "2026-08-06");
  assert.equal(r.total, 6);
  assert.deepEqual(
    r.rows.map((row) => row.id),
    ["PRIN-002", "PRIN-003", "PRIN-006"],
  );
});
test("US-QG-06: each listed entry shows its last Caught date and its blocking_from", () => {
  const [old, checked, justOutside] = reviewRows(fixture, NOW).rows;
  assert.equal(old.last, "2026-05-01");
  assert.equal(checked.last, "");
  assert.equal(checked.blocking, "2026-12-01");
  assert.equal(justOutside.last, "2026-08-05");
});
test("US-QG-06: the review prints the window and the entries as a table", () => {
  const md = reviewToMarkdown(reviewRows(fixture, NOW));
  assert.match(
    md,
    /^### Principles review \(US-QG-06, quarterly\)\n\n3 of 6 gated and checked entries have no Caught line dated 2026-08-06 to 2026-11-06\./,
  );
  assert.match(md, /\| ID \| Principle \| Maturity \| Last Caught \| blocking_from \|/);
  assert.match(md, /\| PRIN-003 \| Principle PRIN-003 \| checked \| none \| 2026-12-01 \|/);
});
test("US-QG-06: when every reviewed entry has a recent Caught line, the review lists nothing", () => {
  const recent = {
    "prin-009-a.md": file("PRIN-009", {
      maturity: "gated",
      evidence: "Caught: 2026-10-01, PR #5, text.",
    }),
  };
  const md = reviewToMarkdown(reviewRows(recent, NOW));
  assert.match(md, /^### Principles review[\s\S]*\n0 of 1 gated and checked entries/);
  assert.doesNotMatch(md, /\| ID \|/);
});
test("US-QG-06: the review reads the real register and reports without failing", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
  const r = reviewRows(readRegister(root), NOW);
  assert.ok(r.total > 0);
  assert.ok(r.rows.length <= r.total);
  assert.match(reviewToMarkdown(r), /### Principles review/);
});
