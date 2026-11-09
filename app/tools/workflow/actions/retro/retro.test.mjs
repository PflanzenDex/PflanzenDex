// US-DEV-11: the retro script keeps exactly one pinned, locked report issue current, and computes the implementer rework
// on the scheduled and manual runs only
import test from "node:test";
import assert from "node:assert/strict";
import { fetchMergedPulls, main } from "./retro.mjs";
import { REPORT_TITLE, reworkByKind } from "./retro-lib.mjs";
import { renderReport } from "./retro-render.mjs";
import { reworkSection } from "./retro-sections.mjs";

const TODAY = "2026-11-09";
const ISSUES = [
  {
    number: 1,
    created_at: "2026-10-05T08:00:00Z",
    closed_at: null,
    labels: [],
    pull_request: false,
  },
  {
    number: 2,
    created_at: "2026-10-06T08:00:00Z",
    closed_at: null,
    labels: [],
    pull_request: false,
  },
];
const PULL = (number, merged_at, title = "fix(web): a") => ({
  number,
  merged_at,
  updated_at: merged_at,
  title,
});
const apiCommit = (message, parents = 1) => ({
  commit: { message },
  parents: Array.from({ length: parents }, (_, i) => ({ sha: `parent${i}` })),
});
const IMPL = "\n\nImplementer: haiku";

/** The REST reads: issues, the merged pull requests (pullPages[n - 1] is page n), commits and changed files by number. */
function restRead(path, { pullPages, commits, files }) {
  if (path.includes("/issues?")) return ISSUES.map((i) => JSON.stringify(i)).join("\n") + "\n";
  if (path.includes("/pulls?")) {
    const page = Number(/&page=(\d+)$/.exec(path)[1]);
    return JSON.stringify(pullPages[page - 1] ?? []);
  }
  const number = Number(/pulls\/(\d+)\//.exec(path)[1]);
  if (path.endsWith("/commits?per_page=100")) return JSON.stringify(commits[number] ?? []);
  if (path.endsWith("/files?per_page=100")) return JSON.stringify(files[number] ?? []);
  throw new Error(`unexpected call: ${path}`);
}

/** The gh writes of the report issue: label, create, lock, pin, edit. */
function reportWrite(args, { pinFails }) {
  if (args[0] === "issue" && args[1] === "create") return "https://github.com/o/r/issues/77\n";
  if (args[0] === "issue" && args[1] === "pin" && pinFails) throw new Error("no permission");
  return "";
}

function fakeClient({
  report = null,
  pinFails = false,
  pullPages = [[]],
  commits = {},
  files = {},
} = {}) {
  const calls = [];
  const reads = { pullPages, commits, files };
  return {
    calls,
    async run(cmd, args) {
      calls.push(args.join(" "));
      if (args[0] === "api") return restRead(args.find((a) => a.startsWith("repos/")) ?? "", reads);
      if (args[0] === "issue" && args[1] === "list") return JSON.stringify(report ? [report] : []);
      return reportWrite(args, { pinFails });
    },
  };
}

const quiet = { log() {}, warn() {} };
const opts = (env = {}) => ({ today: TODAY, env });

test("US-DEV-11: without a report issue it creates, labels, locks and pins one", async () => {
  const client = fakeClient();
  assert.equal(await main(["--write"], client, quiet, opts()), 0);
  assert.ok(client.calls.some((c) => c.startsWith("label create report")));
  assert.ok(
    client.calls.some((c) => c.startsWith(`issue create --title ${REPORT_TITLE} --label report`)),
  );
  assert.ok(client.calls.includes("issue lock 77"));
  assert.ok(client.calls.includes("issue pin 77"));
  assert.ok(!client.calls.some((c) => c.includes("milestone") || c.includes("project")));
});

test("US-DEV-11: a failed pin is a warning, not an error", async () => {
  const warnings = [];
  const client = fakeClient({ pinFails: true });
  const code = await main(["--write"], client, { log() {}, warn: (m) => warnings.push(m) }, opts());
  assert.equal(code, 0);
  assert.match(warnings.join("\n"), /pin/);
});

test("US-DEV-11: an unchanged body is not edited; a changed one is", async () => {
  const body = renderReport(ISSUES, TODAY);
  const same = fakeClient({ report: { number: 9, title: REPORT_TITLE, body } });
  await main(["--write"], same, quiet, opts());
  assert.ok(!same.calls.some((c) => c.startsWith("issue edit")));
  const stale = fakeClient({ report: { number: 9, title: REPORT_TITLE, body: "old" } });
  await main(["--write"], stale, quiet, opts());
  assert.ok(stale.calls.some((c) => c.startsWith("issue edit 9 --body")));
});

test("US-DEV-11: without --write it only prints and changes nothing", async () => {
  const out = [];
  const client = fakeClient();
  await main([], client, { log: (m) => out.push(m), warn() {} }, opts());
  assert.match(out.join("\n"), /xychart-beta/);
  assert.ok(!client.calls.some((c) => /^(issue (edit|create|lock|pin)|label create)/.test(c)));
});

test("US-DEV-11: the merged pull requests are read page by page and reading stops once a page reaches past 28 days", async () => {
  const page1 = Array.from({ length: 100 }, (_, i) => PULL(i + 1, "2026-11-08T10:00:00Z"));
  const page2 = [
    PULL(101, "2026-11-07T10:00:00Z"),
    { number: 102, merged_at: null, updated_at: "2026-11-06T10:00:00Z", title: "closed" },
    PULL(103, "2026-10-01T10:00:00Z"),
  ];
  const client = fakeClient({ pullPages: [page1, page2, [PULL(104, "2026-11-01T10:00:00Z")]] });
  const pulls = await fetchMergedPulls(client, TODAY);
  assert.equal(pulls.length, 102, "merged pull requests only, from the two pages read");
  assert.equal(client.calls.filter((c) => c.includes("/pulls?")).length, 2, "no third page");
});

test("US-DEV-11: a scheduled run computes the implementer rework from the commits and the changed files", async () => {
  const client = fakeClient({
    pullPages: [
      [
        PULL(7, "2026-11-12T10:00:00Z"),
        PULL(8, "2026-11-13T10:00:00Z"),
        PULL(9, "2026-10-01T10:00:00Z"),
        PULL(10, "2026-11-05T10:00:00Z"),
      ],
    ],
    commits: {
      7: [
        apiCommit("chore(dev): claim issue-1 (#1)"),
        apiCommit(`feat(web): the draft${IMPL}`),
        apiCommit("fix(web): the orchestrator's fix"),
      ],
      8: [apiCommit("fix(qs): a product fix")],
    },
    files: {
      7: [{ filename: "app/packages/web/src/a.tsx" }, { filename: "app/packages/web/src/b.tsx" }],
    },
  });
  const out = [];
  await main(
    [],
    client,
    { log: (m) => out.push(m), warn() {} },
    {
      today: "2026-11-20",
      env: { RETRO_EVENT: "schedule" },
    },
  );
  const md = out.join("\n");
  assert.match(md, /\| UI\/layout \| 1 \| 1 \| 100 % \| 1 \|/);
  assert.match(md, /\| \*\*Total\*\* \| 1 \| 1 \| 100 % \| 1 \|/);
  assert.ok(client.calls.some((c) => c.includes("pulls/7/commits")));
  assert.ok(
    !client.calls.some((c) => c.includes("pulls/8/files")),
    "no implementer commit, no files",
  );
  assert.ok(!client.calls.some((c) => c.includes("pulls/9/")), "outside the 28 days, not read");
  assert.ok(
    !client.calls.some((c) => c.includes("pulls/10/")),
    "merged before the trailer existed, not read",
  );
});

test("US-DEV-11: a run that does not compute the rework keeps the section of the report body and reads no commits", async () => {
  const section = reworkSection(reworkByKind([{ kind: "docs", rework: 2 }]));
  const body = renderReport(ISSUES, TODAY, { rework: section });
  const client = fakeClient({ report: { number: 9, title: REPORT_TITLE, body } });
  const out = [];
  await main(
    ["--write"],
    client,
    { log: (m) => out.push(m), warn() {} },
    {
      today: TODAY,
      env: { RETRO_EVENT: "issues" },
    },
  );
  assert.ok(!client.calls.some((c) => c.includes("/commits")), "no commit read on an issue event");
  assert.ok(!client.calls.some((c) => c.startsWith("issue edit")), "the kept body is unchanged");
  assert.match(out.join("\n"), /Report issue #9 unchanged/);
  const printed = [];
  await main(
    [],
    client,
    { log: (m) => printed.push(m), warn() {} },
    {
      today: TODAY,
      env: { RETRO_EVENT: "issues" },
    },
  );
  assert.match(printed.join("\n"), /\| docs \| 1 \| 1 \| 100 % \| 2 \|/);
  assert.match(printed.join("\n"), /Attribution starts on 2026-11-09/);
});
