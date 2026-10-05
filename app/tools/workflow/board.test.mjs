// US-DEV-08: make board marks stale claims and double claims
import test from "node:test";
import assert from "node:assert/strict";
import { buildRows, formatRows } from "./board.mjs";

const NOW = Date.parse("2026-10-03T12:00:00Z");
const hoursAgo = (h) => new Date(NOW - h * 3_600_000).toISOString();
const item = (number, id, assignees = []) => ({
  number,
  title: `${id} · Titel`,
  assignees: assignees.map((login) => ({ login })),
  updatedAt: hoursAgo(100),
});
const rows = (items, prs, branchDates) =>
  buildRows({ items, prs, branchDates, now: NOW, staleHours: 48 });

test("US-DEV-08: an active claim shows assignee, open draft PR and commit age without flags", () => {
  const prs = [
    {
      number: 7,
      title: "feat(wac): x",
      body: "Closes #11",
      state: "OPEN",
      isDraft: true,
      headRefName: "feat/wac-01-measurement",
    },
  ];
  const [r] = rows([item(11, "US-WAC-01", ["konradhe14"])], prs, {
    "feat/wac-01-measurement": hoursAgo(5),
  });
  assert.deepEqual([r.assignees, r.prs, r.age, r.flags], [["konradhe14"], ["#7 draft"], 5, []]);
});

test("US-DEV-08: a claim older than the stale limit is marked STALE", () => {
  const [r] = rows([item(11, "US-WAC-01", ["max"])], [], { "feat/wac-01-x": hoursAgo(60) });
  assert.deepEqual(r.flags, ["STALE"]);
});

test("US-DEV-08: an assignee without any branch ages from the last issue update", () => {
  const [r] = rows([item(11, "US-WAC-01", ["max"])], [], {});
  assert.deepEqual(r.flags, ["STALE"]);
  assert.equal(r.age, null);
});

test("US-DEV-08: two branches for one story are marked DOUBLE (the wac-01 case)", () => {
  const dates = { "feat/wac-01-measurement": hoursAgo(1), "feat/us-wac-01-konrad": hoursAgo(2) };
  const [r] = rows([item(11, "US-WAC-01", ["max"])], [], dates);
  assert.deepEqual(r.flags, ["DOUBLE"]);
});

test("US-DEV-08: two assignees are DOUBLE, a branch of a merged PR is not live", () => {
  const prs = [
    { number: 3, title: "(US-LIC-01)", body: "", state: "MERGED", headRefName: "feat/lic-01-a" },
  ];
  const dates = { "feat/lic-01-a": hoursAgo(1) };
  assert.deepEqual(rows([item(1, "US-LIC-01")], prs, dates)[0].flags, []);
  assert.deepEqual(rows([item(1, "US-LIC-01", ["a", "b"])], [], {})[0].flags, ["STALE", "DOUBLE"]);
});

test("US-DEV-08: work without an assignee is marked NO-CLAIM", () => {
  const [r] = rows([item(2, "US-LIC-02")], [], { "feat/lic-02-x": hoursAgo(1) });
  assert.deepEqual(r.flags, ["NO-CLAIM"]);
});

test("US-DEV-08: the table lists claimed items and counts the free ones", () => {
  const out = formatRows(rows([item(1, "US-LIC-01", ["a"]), item(2, "US-LIC-02")], [], {}), 48);
  assert.match(out, /#1\s+LIC-01\s+@a/);
  assert.doesNotMatch(out, /#2 /);
  assert.match(out, /1 further open items are free/);
});
