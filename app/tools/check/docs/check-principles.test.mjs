import { test } from "node:test";
import assert from "node:assert/strict";
import {
  findProblems,
  isCalendarDay,
  monthsBefore,
  parseCaught,
  run,
} from "./check-principles.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const env = { exists: (p) => p === "app/ok.mjs", makeTargets: ["gates"], today: "2026-11-06" };
const entry = (meta, sections) =>
  `---\n${Object.entries(meta)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n")}\n---\n` +
  Object.entries(sections)
    .map(([h, b]) => `## ${h}\n${b}\n`)
    .join("\n");
const base = { id: "PRIN-001", title: "T", maturity: "observed", spec: "[P-02]" };
const gatedSections = {
  "Why it is better": "x",
  "How it is measured": "x",
  "Checked by": "`app/ok.mjs`",
  Gate: "`make gates`",
  Evidence: "x",
};
const check = (name, text) => findProblems({ [name]: text }, env);

test("US-QG-06: a complete gated entry passes", () => {
  assert.deepEqual(
    check("PRIN-001-a.md", entry({ ...base, maturity: "gated" }, gatedSections)),
    [],
  );
});
test("US-QG-06: an observed entry needs only the why", () => {
  assert.deepEqual(check("PRIN-001-a.md", entry(base, { "Why it is better": "x" })), []);
});
test("US-QG-06: incomplete frontmatter and unknown maturity are rejected", () => {
  assert.match(
    check("PRIN-001-a.md", entry({ id: "PRIN-001" }, {}))[0],
    /^PRIN-1 .*title, maturity, spec/,
  );
  assert.match(
    check("PRIN-001-a.md", entry({ ...base, maturity: "done" }, gatedSections))[0],
    /^PRIN-1 .*unknown maturity/,
  );
  assert.match(check("PRIN-001-a.md", "no frontmatter")[0], /^PRIN-1/);
});
test("US-QG-06: required sections per maturity level", () => {
  const cases = {
    measurable: ["How it is measured"],
    checked: ["Checked by"],
    gated: ["Gate", "Evidence"],
  };
  for (const [maturity, needed] of Object.entries(cases)) {
    const sections = Object.fromEntries(
      Object.entries(gatedSections).filter(([h]) => !needed.includes(h)),
    );
    const p = check("PRIN-001-a.md", entry({ ...base, maturity }, sections));
    for (const n of needed)
      assert.ok(
        p.some((x) => x.includes(`"${n}"`)),
        `${maturity} needs ${n}`,
      );
  }
  const empty = { ...gatedSections, Gate: "  " };
  assert.match(
    check("PRIN-001-a.md", entry({ ...base, maturity: "gated" }, empty))[0],
    /^PRIN-3 .*"Gate"/,
  );
});
test("US-QG-06: ids must be unique and match the file name", () => {
  const text = entry(base, { "Why it is better": "x" });
  const p = findProblems({ "PRIN-001-a.md": text, "PRIN-001-b.md": text }, env);
  assert.match(p[0], /^PRIN-2 .*also used/);
  assert.match(check("PRIN-009-a.md", text)[0], /^PRIN-2 .*must start with "PRIN-001-"/);
});
test("US-QG-06: missing repo paths and make targets are reported", () => {
  const s = { ...gatedSections, "Checked by": "`app/nope.mjs`", Gate: "`make nothing`" };
  const p = check("PRIN-001-a.md", entry({ ...base, maturity: "gated" }, s));
  assert.equal(p.length, 2);
  assert.match(p[0], /^PRIN-4 .*path app\/nope\.mjs/);
  assert.match(p[1], /^PRIN-4 .*make nothing/);
});
test("US-QG-06: the real register in this repo is valid", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
  assert.deepEqual(run(root), []);
});

// blocking_from (criterion 2) and the Caught line (criterion 4).
const checkedSections = {
  "Why it is better": "x",
  "How it is measured": "x",
  "Checked by": "`app/ok.mjs`",
};
const checkedWith = (meta) =>
  check("PRIN-001-a.md", entry({ ...base, maturity: "checked", ...meta }, checkedSections));
const gatedWith = (evidence) =>
  check(
    "PRIN-001-a.md",
    entry({ ...base, maturity: "gated" }, { ...gatedSections, Evidence: evidence }),
  );

test("US-QG-06: a checked entry with a blocking_from day still ahead passes", () => {
  assert.deepEqual(checkedWith({ blocking_from: "2026-11-07" }), []);
});
test("US-QG-06: blocking_from on a gated entry is rejected, the switch is done (PRIN-5)", () => {
  const p = check(
    "PRIN-001-a.md",
    entry({ ...base, maturity: "gated", blocking_from: "2026-12-01" }, gatedSections),
  );
  assert.equal(p.length, 1);
  assert.match(p[0], /^PRIN-5 .*gated entry carries no blocking_from/);
});
test("US-QG-06: a blocking_from day that has come, on an entry not gated, is rejected (PRIN-6)", () => {
  // The day itself counts: from blocking_from on, the gate blocks.
  for (const day of ["2026-11-06", "2026-10-01"]) {
    const p = checkedWith({ blocking_from: day });
    assert.equal(p.length, 1, day);
    assert.ok(p[0].startsWith("PRIN-6 ") && p[0].includes(`blocking_from ${day} has come`), p[0]);
  }
});
test("US-QG-06: blocking_from must be a real calendar day (PRIN-6)", () => {
  for (const value of ["2026-02-30", "soon", "2026-11-6", ""]) {
    const p = checkedWith({ blocking_from: value });
    assert.equal(p.length, 1, value);
    assert.match(p[0], /^PRIN-6 .*is not a date YYYY-MM-DD/);
  }
});
test("US-QG-06: a well-formed Caught line in Evidence passes", () => {
  assert.deepEqual(
    gatedWith("Caught: 2026-10-20, PR #1269, a lookup per row was found by the query count."),
    [],
  );
});
test("US-QG-06: a malformed Caught line is rejected, a bullet is not skipped (PRIN-7)", () => {
  const bad = [
    "Caught: 2026-10-20, PR 1269, text",
    "Caught: 2026-02-30, PR #1269, text",
    "Caught: 2026-10-20, PR #0, text",
    "Caught: 2026-10-20, PR #1269,",
    "- Caught: 2026-10-20, PR #1269, text",
  ];
  for (const line of bad) {
    const p = gatedWith(line);
    assert.equal(p.length, 1, line);
    assert.match(p[0], /^PRIN-7 .*Caught line must read/);
  }
});
test("US-QG-06: a Caught line outside Evidence is rejected (PRIN-7)", () => {
  const s = { ...gatedSections, "Why it is better": "Caught: 2026-10-20, PR #1269, text" };
  const p = check("PRIN-001-a.md", entry({ ...base, maturity: "gated" }, s));
  assert.equal(p.length, 1);
  assert.match(p[0], /^PRIN-7 .*belongs in "Evidence", not in "Why it is better"/);
});
test("US-QG-06: a Caught line dated after today is rejected (PRIN-7)", () => {
  const p = gatedWith("Caught: 2026-11-07, PR #1269, text");
  assert.equal(p.length, 1);
  assert.match(p[0], /^PRIN-7 .*Caught date 2026-11-07 is after today/);
});
test("US-QG-06: parseCaught reads the fixed format into date, PR and text", () => {
  assert.deepEqual(parseCaught("Caught: 2026-10-20, PR #1269, found by the count."), {
    date: "2026-10-20",
    pr: 1269,
    what: "found by the count.",
  });
  assert.equal(parseCaught("Caught: 2028-02-29, PR #1, leap day")?.date, "2028-02-29");
  assert.equal(parseCaught("Caught: 2027-02-29, PR #1, no leap day"), null);
  assert.equal(parseCaught("Evidence: 2026-10-20, PR #1269, text"), null);
});
test("US-QG-06: calendar days are real days, and the window steps back by whole months", () => {
  assert.equal(isCalendarDay("2026-02-28"), true);
  assert.equal(isCalendarDay("2026-02-29"), false);
  assert.equal(isCalendarDay("2026-13-01"), false);
  assert.equal(monthsBefore("2026-11-06", 3), "2026-08-06");
  assert.equal(monthsBefore("2026-03-31", 1), "2026-02-28");
  assert.equal(monthsBefore("2026-03-31", 3), "2025-12-31");
});
