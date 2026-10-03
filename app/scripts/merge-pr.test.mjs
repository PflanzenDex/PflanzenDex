import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { idsIn, problems, specIds } from "./merge-pr.mjs";

const known = new Set(["US-BES-06", "FR-QG-11"]);
const ok = {
  state: "OPEN",
  isDraft: false,
  baseRefName: "dev",
  title: "feat(bes): cards (US-BES-06)",
  body: "",
  files: [{ path: "app/packages/core/src/a.ts" }],
  statusCheckRollup: [{ name: "ci-status", conclusion: "SUCCESS" }],
};

test("US-DEV-02: ids are found in titles and bodies, once", () => {
  assert.deepEqual(idsIn("feat: x (US-BES-06) and FR-QG-11, US-BES-06, NFR-08"), [
    "US-BES-06",
    "FR-QG-11",
    "NFR-08",
  ]);
});

test("US-DEV-02: spec ids come from headings and table rows", () => {
  const dir = mkdtempSync(join(tmpdir(), "specs-"));
  writeFileSync(
    join(dir, "a.md"),
    "### US-ACC-01 · Title · ⬜\n\n| FR-ACC-01 | text | ⬜ |\n| **NFR-08** | text | ⬜ |\nSee US-XXX-99.\n",
  );
  assert.deepEqual([...specIds(dir)].sort(), ["FR-ACC-01", "NFR-08", "US-ACC-01"]);
});

test("US-DEV-02: a green PR into dev with a known story may be merged", () => {
  assert.deepEqual(problems(ok, known), []);
});

test("US-DEV-02: each failed condition is named and stops the merge", () => {
  assert.match(problems({ ...ok, isDraft: true }, known)[0], /draft/);
  assert.match(problems({ ...ok, baseRefName: "main" }, known)[0], /dev. only/);
  assert.match(problems({ ...ok, statusCheckRollup: [] }, known)[0], /not reported/);
  assert.match(
    problems(
      { ...ok, statusCheckRollup: [{ name: "ci-status", conclusion: "FAILURE" }] },
      known,
    )[0],
    /FAILURE/,
  );
  assert.match(
    problems({ ...ok, title: "chore: tidy", body: "no story" }, known)[0],
    /no spec, no merge/,
  );
  assert.match(problems({ ...ok, title: "feat: x (US-XXX-99)" }, known)[0], /no spec, no merge/);
});

test("US-DEV-02: a PR that changes a gate file is left to a human", () => {
  const gate = {
    ...ok,
    files: [
      ...ok.files,
      { path: ".github/workflows/ci.yml" },
      { path: "app/scripts/merge-pr.mjs" },
    ],
  };
  assert.match(problems(gate, known)[0], /gate files.*ci\.yml.*merge-pr\.mjs/);
});
