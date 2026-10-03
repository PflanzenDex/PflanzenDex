import { test } from "node:test";
import assert from "node:assert/strict";
import { findProblems, run } from "./check-principles.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const env = { exists: (p) => p === "app/ok.mjs", makeTargets: ["gates"] };
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
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  assert.deepEqual(run(root), []);
});
