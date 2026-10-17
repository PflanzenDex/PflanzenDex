// US-DEV-11: the issue flow retro counts created vs. closed issues per day and renders the report issue
import test from "node:test";
import assert from "node:assert/strict";
import { averages, countable, dailyFlow, dayOf, REPORT_LABEL } from "./retro-lib.mjs";
import { renderReport } from "./retro-render.mjs";

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
