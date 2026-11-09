// US-DEV-11: the issue flow retro counts created vs. closed issues per day, the process share (E-30) and the implementer
// rework, and renders the report issue
import test from "node:test";
import assert from "node:assert/strict";
import {
  averages,
  countable,
  dailyFlow,
  dayOf,
  isProcessTitle,
  kindOf,
  processShare,
  REPORT_LABEL,
  reworkByKind,
  reworkOf,
  reworkRequested,
} from "./retro-lib.mjs";
import { renderReport } from "./retro-render.mjs";
import { keptRework, reworkSection, reworkTable } from "./retro-sections.mjs";

// Berlin is UTC+2 in October: 22:30Z is already the next day there.
const issue = (created_at, closed_at = null, extra = {}) => ({ created_at, closed_at, ...extra });

test("US-DEV-11: day boundaries are Europe/Berlin, not UTC", () => {
  assert.equal(dayOf("2026-10-05T21:59:00Z"), "2026-10-05");
  assert.equal(dayOf("2026-10-05T22:30:00Z"), "2026-10-06");
});

test("US-DEV-11: pull requests and report issues do not count", () => {
  assert.equal(countable(issue("2026-10-05T10:00:00Z")), true);
  assert.equal(countable(issue("2026-10-05T10:00:00Z", null, { pull_request: {} })), false);
  assert.equal(
    countable(issue("2026-10-05T10:00:00Z", null, { labels: [{ name: REPORT_LABEL }] })),
    false,
  );
});

test("US-DEV-11: per day it counts created, closed, net and open at the end of the day", () => {
  const issues = [
    issue("2026-10-05T08:00:00Z", "2026-10-06T08:00:00Z"),
    issue("2026-10-05T09:00:00Z"),
    issue("2026-10-06T09:00:00Z", "2026-10-06T10:00:00Z"),
  ];
  assert.deepEqual(dailyFlow(issues, "2026-10-07"), [
    { day: "2026-10-05", created: 2, closed: 0, open: 2 },
    { day: "2026-10-06", created: 1, closed: 2, open: 1 },
    { day: "2026-10-07", created: 0, closed: 0, open: 1 },
  ]);
});

test("US-DEV-11: averages skip the kickoff day and today; the last 7 full days stand next to them", () => {
  const days = [{ day: "k", created: 100, closed: 0 }];
  for (let i = 0; i < 9; i++) days.push({ day: `d${i}`, created: i < 2 ? 10 : 4, closed: 3 });
  days.push({ day: "today", created: 50, closed: 50 });
  const a = averages(days);
  assert.equal(a.all.days, 9);
  assert.equal(a.all.created, 48 / 9);
  assert.equal(a.all.closed, 3);
  assert.equal(a.last7.days, 7);
  assert.equal(a.last7.created, 4);
  assert.equal(a.last7.net, 1);
});

test("US-DEV-11: fewer than 2 full days give unknown averages, never a guess", () => {
  const days = [
    { day: "k", created: 5, closed: 0 },
    { day: "d", created: 1, closed: 0 },
    { day: "today", created: 0, closed: 0 },
  ];
  assert.equal(averages(days), null);
  const md = renderReport(
    [issue("2026-10-05T08:00:00Z"), issue("2026-10-06T08:00:00Z")],
    "2026-10-07",
  );
  assert.match(md, /unknown/);
});

test("US-DEV-11: the report says it is generated, is no work item and charts the burndown", () => {
  const issues = [];
  for (let d = 1; d <= 9; d++) {
    const day = `2026-10-0${d}T10:00:00Z`;
    issues.push(issue(day), issue(day), issue(day, d < 9 ? `2026-10-0${d + 1}T10:00:00Z` : null));
  }
  const md = renderReport(issues, "2026-10-09");
  assert.match(md, /Do not claim/);
  assert.match(md, /grows by 2\.0 issues per day/);
  assert.match(md, /xychart-beta/);
  assert.match(md, /Open at the end of the day/);
  assert.match(md, /\| 2026-10-08 \| 3 \| 1 \| \+2 \| 17 \|/);
  assert.match(md, /latest event 2026-10-09/);
  assert.doesNotMatch(
    md,
    /\d\d:\d\d/,
    "no clock time, so an unchanged state gives an identical body",
  );
});

test("US-DEV-11: the same issues on the same day render byte-identical (idempotent)", () => {
  const issues = [
    issue("2026-10-05T08:00:00Z"),
    issue("2026-10-06T08:00:00Z", "2026-10-07T08:00:00Z"),
  ];
  assert.equal(
    renderReport(issues, "2026-10-08"),
    renderReport([...issues].reverse(), "2026-10-08"),
  );
});

test("US-DEV-11: the day rows run across the clock change and the month end without a gap", () => {
  const rows = dailyFlow([{ created_at: "2026-10-24T10:00:00Z", closed_at: null }], "2026-11-02");
  assert.equal(rows.length, 10);
  assert.deepEqual(rows.map((r) => r.day).slice(6, 9), ["2026-10-30", "2026-10-31", "2026-11-01"]);
});

// Process share (E-30): today is 2026-11-09, so the last 7 full days are 11-02 to 11-08 and the last 28 are 10-12 to 11-08.
const PULL = (number, merged_at, title) => ({ number, merged_at, updated_at: merged_at, title });

test("US-DEV-11: the process share counts merged pull requests of the last 7 and 28 full days, today left out", () => {
  const pulls = [
    PULL(1, "2026-11-08T10:00:00Z", "chore(dev): a"), // in both windows, process
    PULL(2, "2026-11-05T10:00:00Z", "fix(qs): b"), // in both windows, product
    PULL(3, "2026-11-02T10:00:00Z", "ci(deps): c"), // first day of the 7-day window, scope deps is not process
    PULL(4, "2026-11-01T10:00:00Z", "chore(qg): d"), // only in the 28-day window, process
    PULL(5, "2026-10-11T23:00:00Z", "docs: e"), // Berlin 10-12, first day of the 28-day window, docs without scope
    PULL(6, "2026-10-11T20:00:00Z", "chore(dev): f"), // Berlin 10-11, outside the 28-day window
    PULL(7, "2026-11-09T08:00:00Z", "chore(dev): g"), // today, not a full day
    { number: 8, merged_at: null, updated_at: "2026-11-08T10:00:00Z", title: "chore(dev): h" },
  ];
  assert.deepEqual(processShare(pulls, "2026-11-09"), [
    { days: 7, merged: 3, process: 1, share: 1 / 3 },
    { days: 28, merged: 5, process: 2, share: 2 / 5 },
  ]);
});

test("US-DEV-11: no merged pull request in a window gives an unknown share, not a division by zero", () => {
  assert.deepEqual(processShare([], "2026-11-09"), [
    { days: 7, merged: 0, process: 0, share: null },
    { days: 28, merged: 0, process: 0, share: null },
  ]);
});

test("US-DEV-11: the process scope is dev, qg or ci, and a docs title without a scope is not process work", () => {
  assert.equal(isProcessTitle("chore(dev): a"), true);
  assert.equal(isProcessTitle("feat(qg)!: b"), true);
  assert.equal(isProcessTitle("ci(ci): c"), true);
  assert.equal(isProcessTitle("docs: d"), false);
  assert.equal(isProcessTitle("fix(qs): e"), false);
  assert.equal(isProcessTitle("feat(devx): f"), false);
  assert.equal(isProcessTitle("Plain title without scope"), false);
});

// Implementer rework (US-DEV-11): commits are { message, parents } oldest first.
const commit = (message, parents = 1) => ({ message, parents });
const IMPL = "\n\nImplementer: haiku";

test("US-DEV-11: a pull request without an implementer commit is not counted in the rework", () => {
  assert.equal(reworkOf([commit("chore(dev): claim issue-1 (#1)"), commit("fix(qs): a")]), null);
});

test("US-DEV-11: the claim commit and merge commits are left out of the rework", () => {
  const commits = [
    commit("chore(dev): claim issue-1750 (#1750)"),
    commit(`feat(web): the first draft${IMPL}`),
    commit("Merge branch 'dev' into feat/x", 2),
    commit("chore(dev): merge dev into the branch", 2),
    commit("Merge remote-tracking branch 'origin/dev'"),
    commit("fix(web): the orchestrator's fix"),
  ];
  assert.deepEqual(reworkOf(commits), { rework: 1 });
});

test("US-DEV-11: rework is counted after the first implementer commit only, never before it", () => {
  const commits = [
    commit("fix(web): done before the implementer started"),
    commit(`feat(web): implementer part one${IMPL}`),
    commit("fix(web): orchestrator fix after the implementer"),
    commit(`feat(web): implementer part two${IMPL}`),
    commit("fix(web): orchestrator fix after the second implementer part"),
  ];
  assert.deepEqual(reworkOf(commits), { rework: 2 });
});

test("US-DEV-11: a kind is the kind with the most changed files; ties go to the kind listed first", () => {
  assert.equal(
    kindOf(["app/packages/web/a.tsx", "app/packages/web/b.tsx", "app/packages/core/c.ts"]),
    "UI/layout",
  );
  assert.equal(kindOf(["app/packages/core/x.ts", "app/packages/web/y.tsx"]), "UI/layout");
  assert.equal(
    kindOf(["app/packages/core/x.ts", "app/packages/api/z.ts", "app/packages/web/y.tsx"]),
    "core/API",
  );
  assert.equal(kindOf(["app/tools/workflow/a.mjs", "Makefile"]), "tooling/gates");
  assert.equal(kindOf(["tools/x.sh", ".github/workflows/retro.yml"]), "tooling/gates");
  assert.equal(kindOf(["Makefile", "docs/a.md"]), "tooling/gates");
  assert.equal(kindOf(["docs/specs/product/19.md", "README.md"]), "docs");
  assert.equal(kindOf(["docs/a.md", "app/config/project/x.js"]), "docs");
  assert.equal(kindOf(["app/config/project/x.js"]), "other");
});

test("US-DEV-11: the rework table gives per kind the share and the median, and the total last", () => {
  const rows = reworkByKind([
    { kind: "UI/layout", rework: 0 },
    { kind: "UI/layout", rework: 3 },
    { kind: "UI/layout", rework: 1 },
    { kind: "docs", rework: 0 },
  ]);
  assert.deepEqual(rows, [
    { kind: "UI/layout", prs: 3, withRework: 2, share: 2 / 3, median: 1 },
    { kind: "docs", prs: 1, withRework: 0, share: 0, median: 0 },
    { kind: "Total", prs: 4, withRework: 2, share: 0.5, median: 0.5, total: true },
  ]);
});

test("US-DEV-11: a rework table without counted pull requests shows unknown, not a guess", () => {
  assert.deepEqual(reworkByKind([]), [
    { kind: "Total", prs: 0, withRework: 0, share: null, median: null, total: true },
  ]);
  assert.match(reworkTable(reworkByKind([])), /\*\*Total\*\* \| 0 \| 0 \| unknown \| unknown/);
});

test("US-DEV-11: the rework table renders the share in percent and the total in bold", () => {
  const md = reworkTable(
    reworkByKind([
      { kind: "UI/layout", rework: 0 },
      { kind: "UI/layout", rework: 3 },
      { kind: "UI/layout", rework: 1 },
    ]),
  );
  assert.match(md, /\| UI\/layout \| 3 \| 2 \| 67 % \| 1 \|/);
  assert.match(md, /\| \*\*Total\*\* \| 3 \| 2 \| 67 % \| 1 \|/);
});

test("US-DEV-11: the rework is requested by the scheduled and manual runs only", () => {
  assert.equal(reworkRequested([], { RETRO_EVENT: "schedule" }), true);
  assert.equal(reworkRequested([], { RETRO_EVENT: "workflow_dispatch" }), true);
  assert.equal(reworkRequested([], { RETRO_EVENT: "issues" }), false);
  assert.equal(reworkRequested([], {}), false);
  assert.equal(reworkRequested(["--rework"], {}), true);
});

test("US-DEV-11: a run without the rework keeps the rework section of the report body unchanged", () => {
  const rows = reworkByKind([{ kind: "docs", rework: 2 }]);
  const section = reworkSection(rows);
  const body = renderReport([issue("2026-10-05T08:00:00Z")], "2026-10-07", { rework: section });
  assert.equal(keptRework(body), section);
  assert.match(keptRework(body), /Attribution starts on 2026-11-09/);
  assert.equal(
    keptRework("a body from before the markers"),
    "<!-- retro:rework:start -->\nImplementer rework: computed by the nightly run.\n<!-- retro:rework:end -->",
  );
  assert.equal(keptRework(undefined), keptRework("a body from before the markers"));
});

test("US-DEV-11: the report shows the process share and the rework section next to the averages", () => {
  const pulls = [
    PULL(1, "2026-11-08T10:00:00Z", "chore(dev): a"),
    PULL(2, "2026-11-05T10:00:00Z", "fix(qs): b"),
  ];
  const md = renderReport(
    [issue("2026-10-05T08:00:00Z"), issue("2026-10-06T08:00:00Z")],
    "2026-11-09",
    { pulls, rework: reworkSection(reworkByKind([])) },
  );
  assert.match(md, /## Process share \(E-30\)/);
  assert.match(md, /\| Last 7 full days \| 2 \| 1 \| 50 % \|/);
  assert.match(md, /## Implementer rework \(last 28 days\)/);
  assert.ok(md.indexOf("## Process share") < md.indexOf("## Created vs. closed"));
});
