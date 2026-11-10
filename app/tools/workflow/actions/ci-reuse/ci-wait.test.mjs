// US-DEV-13: the CI result of a pull request as `make ci-wait` reads it. The fixtures are real records of PR 1465 and PR 1476
// (ci-wait.fixtures.json: pull request, changed files, check runs, workflow runs, and the jobs of the head's ci.yml, trimmed
// to the fields that the reading uses; read 2026-11-06). A state "at a time" is made from those final records.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { evidenceOf } from "./ci-reuse.mjs";
import { report, stateLine } from "./ci-report.mjs";
import {
  assess,
  exitCodeOf,
  JOBS,
  jobsDefinedIn,
  PATHS,
  problemsNow,
  pullOf,
  requiredJobs,
} from "./verdict/ci-verdict.mjs";
import { readSnapshot, waitForCi } from "./ci-wait.mjs";

const fixtures = JSON.parse(
  readFileSync(new URL("./ci-wait.fixtures.json", import.meta.url), "utf8"),
);
const CI_YML = new URL("../../../../../.github/workflows/ci.yml", import.meta.url);
const REPO = "PflanzenDex/PflanzenDex";
const HEAD_1476 = "3f89472cfb96da8676a80d87e76f7dd0c9b6dfbe";
// US-QG-06: an entry of the quarantine list as the tests need it (the list of the merge commit, none in the fixtures).
const QUARANTINED_LIGHTHOUSE = {
  job: "lighthouse",
  since: "2026-11-09",
  issue: 1748,
  reason: "red on dev",
};

/** The snapshot of a fixture PR, as readSnapshot builds it. */
function snapOf(key) {
  const f = fixtures[key];
  return {
    pr: pullOf(f.pull),
    head: f.pull.head.sha,
    files: f.files,
    defined: new Set(f.definedJobs),
    checkRuns: structuredClone(f.checkRuns),
    workflowRuns: structuredClone(f.workflowRuns),
  };
}

/** The PR as it was before the merge: open and mergeable. */
const open = (snap) => ({
  ...snap,
  pr: {
    ...snap.pr,
    state: "open",
    merged: false,
    mergedAt: null,
    mergeable: true,
    mergeableState: "clean",
  },
});

/** The state at a time: later runs are left out, runs still going at that time are in progress. */
function asOf(snap, time) {
  const at = Date.parse(time);
  return {
    ...snap,
    checkRuns: snap.checkRuns
      .filter((c) => Date.parse(c.started_at) <= at)
      .map((c) =>
        Date.parse(c.completed_at) > at
          ? { ...c, status: "in_progress", conclusion: null, completed_at: null }
          : c,
      ),
    workflowRuns: snap.workflowRuns
      .filter((w) => Date.parse(w.created_at) <= at)
      .map((w) =>
        Date.parse(w.updated_at) > at && w.status === "completed"
          ? { ...w, status: "in_progress", conclusion: null }
          : w,
      ),
  };
}

const rowOf = (a, job) => a.rows.find((r) => r.job === job);
const onRun = (id) => (c) => c.details_url.includes(`/runs/${id}/`);

/** A fake clock for waitForCi: sleep advances the time, log keeps the lines. */
function clock() {
  const c = { t: 0, sleeps: [], logs: [] };
  c.now = () => c.t;
  c.sleep = async (ms) => {
    c.sleeps.push(ms);
    c.t += ms;
  };
  c.log = (line) => c.logs.push(line);
  return c;
}

/** Reads that answer from a list (an Error is thrown; the last entry repeats) and count the calls. */
function reads(list) {
  const calls = [];
  return {
    calls,
    read: async (n) => {
      calls.push(n);
      const item = list[Math.min(calls.length - 1, list.length - 1)];
      if (item instanceof Error) throw item;
      return item;
    },
  };
}

const waitOpts = (c, read, timeoutMs = 600_000) => ({
  read,
  sleep: c.sleep,
  now: c.now,
  log: c.log,
  timeoutMs,
});

// US-QG-01 (issue 1485, owner decision 2026-11-07): the matrix shards of the UI gates are jobs of their own in ci.yml (one job
// per shard runs both gates). Their check runs are named "ui shard <n>", so the verdict cannot read them by job name; their
// result reaches the verdict through the job `results` (issue 1608), which needs every shard and fails unless all of them passed.
const MATRIX_SHARDS = ["ui-shard"];
// Jobs that `results` replaced (issue 1608): the verdict keeps them, so a head whose ci.yml still defines them is judged.
const RETIRED_JOBS = ["app-coverage", "one-screen", "a11y-routes"];

test("US-DEV-13 (issue 1608): every job of ci.yml is judged, except ci-status and the matrix shards", () => {
  const defined = jobsDefinedIn(readFileSync(CI_YML, "utf8"));
  const judged = [...defined].filter((j) => j !== "ci-status" && !MATRIX_SHARDS.includes(j));
  assert.deepEqual(
    judged.filter((j) => !JOBS.includes(j)),
    [],
    "a job of ci.yml that is not judged",
  );
  assert.deepEqual(
    JOBS.filter((j) => !RETIRED_JOBS.includes(j) && !defined.has(j)),
    [],
    "a judged job that ci.yml does not define",
  );
});

test("US-QG-01 (issue 1608): every matrix shard is needed by the results job, and that job is judged", () => {
  const text = readFileSync(CI_YML, "utf8");
  const block = text.slice(text.indexOf("\n  results:\n"));
  const needs = block.split("\n").find((line) => line.startsWith("    needs:"));
  for (const shard of MATRIX_SHARDS) {
    assert.ok(needs?.includes(shard), `results needs ${shard}: ${needs}`);
  }
  assert.ok(JOBS.includes("results"));
});

test("US-QG-02 (issue 1608): the ui output is the app paths without workflow and dev tooling, hooks, docs and Markdown", () => {
  assert.ok(PATHS.ui.test("app/packages/web/src/x.tsx"));
  assert.ok(PATHS.ui.test("app/tools/check/x.mjs"), "a check script is an app path");
  assert.ok(PATHS.ui.test("Makefile"));
  assert.ok(PATHS.ui.test(".github/workflows/ci.yml"));
  assert.ok(!PATHS.ui.test("app/tools/workflow/x.mjs"));
  assert.ok(!PATHS.ui.test("app/tools/dev/x.mjs"));
  assert.ok(!PATHS.ui.test(".claude/hooks/rules.mjs"));
  assert.ok(!PATHS.ui.test("docs/guides/x.md"));
  assert.ok(!PATHS.ui.test("app/packages/web/src/x.md"));
  assert.ok(!PATHS.ui.test(".agents/skills/x/SKILL.md"));
  assert.ok(!PATHS.ui.test("README.md"));
});

test("US-QG-02 (issue 1608): a workflow-only change runs the app jobs and the results job, but no UI gate and no web tests", () => {
  const req = requiredJobs({
    files: ["app/tools/workflow/actions/ci-reuse/verdict/ci-verdict.mjs"],
    base: "dev",
    draft: false,
    defined: new Set(JOBS),
  });
  for (const job of ["app-gates", "app-tests", "results"]) assert.ok(req.has(job), job);
  // A change without UI leaves the web package as it was, so the web tests are not required (US-QG-02).
  for (const job of [
    "app-tests-web",
    "app-ui",
    "ds-snapshots",
    "lighthouse",
    "one-screen",
    "a11y-routes",
    "layout",
    "docs-gates",
  ]) {
    assert.ok(!req.has(job), job);
  }
  const docs = requiredJobs({
    files: ["docs/x.md"],
    base: "dev",
    draft: false,
    defined: new Set(JOBS),
  });
  assert.ok(!docs.has("results") && !docs.has("app-tests") && !docs.has("app-tests-web"));
  assert.ok(docs.has("docs-gates") && docs.has("layout"));
});

test("US-QG-02 (issue 1608): an app PR runs the layout and docs checks in app-gates, and the web tests for a UI change only", () => {
  const defined = new Set(JOBS);
  const cases = [
    // [files, jobs that are required, jobs that are not required]
    [["docs/x.md"], ["docs-gates", "layout"], ["app-gates", "app-tests-web"]],
    [["README.md"], ["docs-gates", "layout"], ["app-gates"]],
    [[".githooks/pre-push"], ["layout"], ["docs-gates", "app-gates"]],
    [["app/packages/core/src/a.ts"], ["app-gates", "app-tests-web"], ["layout", "docs-gates"]],
    [
      ["app/packages/core/src/a.ts", "docs/x.md"],
      ["app-gates", "app-tests-web"],
      ["layout", "docs-gates"],
    ],
    [
      ["app/tools/workflow/x.mjs", "docs/x.md"],
      ["app-gates", "app-tests"],
      ["layout", "docs-gates", "app-tests-web"],
    ],
  ];
  for (const [files, yes, no] of cases) {
    const req = requiredJobs({ files, base: "dev", draft: false, defined });
    for (const job of yes) assert.ok(req.has(job), `${files}: ${job} is required`);
    for (const job of no) assert.ok(!req.has(job), `${files}: ${job} is not required`);
  }
});

test("US-DEV-13: the path filters are the ones that the changes job of ci.yml uses, with the same text", () => {
  const text = readFileSync(CI_YML, "utf8");
  // RegExp.source escapes the slashes; ci.yml writes them plain.
  for (const re of Object.values(PATHS)) {
    const pattern = re.source.replaceAll("\\/", "/");
    assert.ok(text.includes(pattern), pattern);
  }
});

test("US-DEV-13: the path filters match the same files as the changes job", () => {
  assert.ok(PATHS.app.test(".claude/hooks/rules.mjs"));
  assert.ok(PATHS.docs.test("README.md"));
  assert.ok(PATHS.docs.test("app/src/notes.md"));
  assert.ok(PATHS.app.test("app/config/gates/coverage-thresholds.json"));
  assert.ok(PATHS.oneScreen.test("app/config/gates/coverage-thresholds.json"));
  assert.ok(!PATHS.oneScreen.test("app/packages/api/src/a.ts"));
  assert.ok(!PATHS.docs.test("app/packages/api/src/a.ts"));
});

test("US-DEV-13: jobsDefinedIn reads the jobs under jobs: and not the triggers under on:", () => {
  const yml =
    "on:\n  push:\n  pull_request:\njobs:\n  changes:\n    runs-on: x\n    steps:\n      - run: y\n  ci-status:\n    needs: [changes]\n";
  assert.deepEqual([...jobsDefinedIn(yml)], ["changes", "ci-status"]);
});

test("US-DEV-13: the jobs required for a PR follow the path filter, the draft state and the base branch", () => {
  const defined = new Set(JOBS);
  const docsOnly = requiredJobs({ files: ["docs/x.md"], base: "dev", draft: false, defined });
  assert.ok(docsOnly.has("docs-gates"));
  assert.ok(!docsOnly.has("app-gates") && !docsOnly.has("one-screen"));
  const core = requiredJobs({
    files: ["app/packages/core/src/a.ts"],
    base: "dev",
    draft: false,
    defined,
  });
  assert.ok(core.has("app-gates") && core.has("lighthouse") && core.has("metadata"));
  assert.ok(!core.has("one-screen") && !core.has("audit"));
  const ui = requiredJobs({
    files: ["app/packages/web/src/x.tsx"],
    base: "main",
    draft: false,
    defined,
  });
  assert.ok(ui.has("one-screen") && ui.has("a11y-routes") && ui.has("audit") && ui.has("e2e"));
});

test("US-DEV-13: when GitHub lists 3000 files, every path filter counts as matched", () => {
  const files = Array.from({ length: 3000 }, () => "x.txt");
  const req = requiredJobs({ files, base: "dev", draft: false, defined: new Set(JOBS) });
  assert.ok(req.has("app-gates") && req.has("one-screen") && req.has("app-tests-web"));
  // The app path counts as matched, so the docs and layout checks are the ones that app-gates runs (US-QG-02).
  assert.ok(!req.has("docs-gates") && !req.has("layout"));
});

test("US-DEV-13: a job that the head's workflow does not define is never required (PR 1465 predates docs-gates)", () => {
  const s = snapOf("pr1465");
  const withDefined = requiredJobs({
    files: s.files,
    base: "dev",
    draft: false,
    defined: s.defined,
  });
  assert.ok(!withDefined.has("docs-gates"));
  const ifDefined = requiredJobs({
    files: s.files,
    base: "dev",
    draft: false,
    defined: new Set(JOBS),
  });
  // PR 1465 changes app paths too, so the docs checks are app-gates' and the job is not required (US-QG-02).
  assert.ok(!ifDefined.has("docs-gates"), "an app PR runs the docs checks in app-gates");
  const docsOnly = requiredJobs({
    files: ["docs/x.md"],
    base: "dev",
    draft: false,
    defined: new Set(JOBS),
  });
  assert.ok(
    docsOnly.has("docs-gates"),
    "docs/ changed without an app path, so the job is required",
  );
});

test("US-DEV-13: PR 1476 requires the app and UI jobs of its own workflow, not the docs jobs and not the main-only ones", () => {
  const s = snapOf("pr1476");
  const required = requiredJobs({ files: s.files, base: "dev", draft: false, defined: s.defined });
  for (const job of [
    "app-gates",
    "app-coverage",
    "lighthouse",
    "one-screen",
    "a11y-routes",
    "metadata",
  ]) {
    assert.ok(required.has(job), job);
  }
  // PR 1476 changes app paths, so app-gates runs the docs and layout checks (US-QG-02).
  assert.ok(!required.has("docs-gates") && !required.has("layout"));
  assert.ok(!required.has("audit") && !required.has("e2e"));
});

test("US-DEV-13: the latest finished run that did work decides; skipped and cancelled runs are no result", () => {
  const run = (id, conclusion, done) => ({
    status: "completed",
    conclusion,
    completed_at: done,
    details_url: `https://github.com/${REPO}/actions/runs/${id}/job/1`,
  });
  const runs = [
    run(1, "success", "2026-01-01T10:00:00Z"),
    run(2, "failure", "2026-01-01T11:00:00Z"),
    run(3, "skipped", "2026-01-01T12:00:00Z"),
  ];
  assert.deepEqual(evidenceOf(runs), {
    conclusion: "failure",
    run: "2",
    at: "2026-01-01T11:00:00Z",
  });
  assert.equal(evidenceOf([run(4, "cancelled", "2026-01-01T10:00:00Z")]).conclusion, "cancelled");
  assert.equal(evidenceOf([run(5, "skipped", "2026-01-01T10:00:00Z")]), null);
  assert.equal(evidenceOf([{ status: "in_progress", conclusion: null }]), null);
});

test("US-DEV-13: a cancelled run after a success does not turn the job red (PR 1476 app-gates, app-coverage)", () => {
  const a = assess(open(snapOf("pr1476")));
  assert.equal(rowOf(a, "app-gates").result, "success");
  assert.equal(rowOf(a, "app-gates").run, "42185065502");
  assert.equal(rowOf(a, "app-coverage").result, "success");
});

test("US-DEV-13: a job skipped by the text-edit run keeps the result of the full run (PR 1465 a11y-routes)", () => {
  const row = rowOf(assess(open(snapOf("pr1465"))), "a11y-routes");
  assert.equal(row.result, "success");
  assert.equal(row.run, "42177736005");
});

test("US-DEV-13: the green ci-status of a text edit does not count while the full run of PR 1465 is still going", () => {
  const a = assess(open(asOf(snapOf("pr1465"), "2026-11-06T07:00:00Z")));
  assert.equal(a.status, "running");
  assert.ok(a.unfinished.includes("app-ui"));
  assert.equal(a.aggregate.conclusion, "success", "the aggregate of the text edit is green");
});

test("US-DEV-13: PR 1465 and PR 1476 are green once every run of their head is final", () => {
  for (const key of ["pr1465", "pr1476"]) {
    const a = assess(open(snapOf(key)));
    assert.equal(a.status, "settled", key);
    assert.deepEqual(a.problems, [], key);
    assert.equal(exitCodeOf(a), 0, key);
  }
});

test("US-DEV-13: a queued workflow run keeps the PR waiting before its check runs exist (PR 1476 at 08:07)", () => {
  const s = open(snapOf("pr1476"));
  const queued = {
    ...s,
    checkRuns: s.checkRuns.filter((c) => !onRun(42185354551)(c)),
    workflowRuns: s.workflowRuns.map((w) =>
      w.id === 42185354551 ? { ...w, status: "queued", conclusion: null } : w,
    ),
  };
  const a = assess(queued);
  assert.equal(a.status, "running");
  assert.deepEqual(a.unfinished, ["CI workflow run (queued)"]);
});

test("US-DEV-13: a merged PR is reported as merged and is not waited for (PR 1465)", async () => {
  const s = snapOf("pr1465");
  const a = assess(s);
  assert.equal(a.status, "merged");
  assert.equal(exitCodeOf(a), 0);
  assert.match(report(a), /already merged \(at 2026-11-06T07:09:51Z\)/);
  const c = clock();
  const r = reads([s]);
  const out = await waitForCi(1465, waitOpts(c, r.read));
  assert.equal(out.status, "merged");
  assert.equal(r.calls.length, 1);
  assert.deepEqual(c.sleeps, []);
});

test("US-DEV-13: a conflicting PR fails at once, because it gets no CI run", async () => {
  const s = open(snapOf("pr1476"));
  const conflict = {
    ...s,
    pr: { ...s.pr, mergeable: false, mergeableState: "dirty" },
    checkRuns: [],
    workflowRuns: [],
  };
  assert.equal(assess(conflict).status, "conflict");
  const c = clock();
  const r = reads([conflict]);
  const out = await waitForCi(1476, waitOpts(c, r.read));
  assert.equal(out.status, "conflict");
  assert.equal(exitCodeOf(out), 1);
  assert.equal(r.calls.length, 1);
  assert.deepEqual(c.sleeps, []);
  assert.match(report(out), /conflicts with dev/);
});

test("US-DEV-13: a PR closed without a merge fails", () => {
  const s = snapOf("pr1465");
  const a = assess({ ...s, pr: { ...s.pr, merged: false, mergedAt: null, state: "closed" } });
  assert.equal(a.status, "closed");
  assert.equal(exitCodeOf(a), 1);
});

test("US-DEV-13: mergeability that GitHub has not computed yet keeps the wait going", () => {
  const s = open(snapOf("pr1476"));
  assert.equal(assess({ ...s, pr: { ...s.pr, mergeable: null } }).status, "computing");
});

test("US-DEV-13: the wait ends only once the PR stayed quiet for the settle time", async () => {
  const c = clock();
  const r = reads([open(snapOf("pr1476"))]);
  const out = await waitForCi(1476, waitOpts(c, r.read));
  assert.equal(out.status, "settled");
  assert.equal(r.calls.length, 3, "polls at 0, 30 and 60 s");
  assert.equal(c.t, 60_000);
});

test("US-DEV-13: a run that starts during the settle time starts the settle time again", async () => {
  const s = open(snapOf("pr1476"));
  const queued = {
    ...s,
    workflowRuns: s.workflowRuns.map((w) =>
      w.id === 42185354551 ? { ...w, status: "queued", conclusion: null } : w,
    ),
  };
  const c = clock();
  const r = reads([s, s, queued, s, s, s]);
  const out = await waitForCi(1476, waitOpts(c, r.read));
  assert.equal(out.status, "settled");
  assert.equal(c.t, 150_000, "the quiet period starts again after the queued run at 60 s");
  assert.equal(r.calls.length, 6);
});

test("US-DEV-13: a new head commit starts the settle time again", async () => {
  const s = open(snapOf("pr1476"));
  const next = "f".repeat(40);
  const moved = { ...s, head: next, pr: { ...s.pr, head: next } };
  const c = clock();
  const r = reads([s, moved]);
  const out = await waitForCi(1476, waitOpts(c, r.read));
  assert.equal(out.head, next);
  assert.equal(c.t, 90_000);
  assert.equal(r.calls.length, 4);
});

test("US-DEV-13: the timeout ends the wait and names the unfinished checks", async () => {
  const running = open(asOf(snapOf("pr1465"), "2026-11-06T07:00:00Z"));
  const c = clock();
  const r = reads([running]);
  const out = await waitForCi(1465, waitOpts(c, r.read, 90_000));
  assert.equal(out.status, "timeout");
  assert.equal(exitCodeOf(out), 1);
  assert.match(report(out), /timed out after 2 min; still open: .*app-ui/);
});

test("US-DEV-13: one failed read is retried, three failed reads in a row stop the wait", async () => {
  const s = open(snapOf("pr1465"));
  const boom = new Error("GitHub API 502");
  const c = clock();
  const once = reads([boom, s]);
  const out = await waitForCi(1465, waitOpts(c, once.read));
  assert.equal(out.status, "settled");
  assert.ok(c.logs.some((l) => /retrying in 30 s: GitHub API 502/.test(l)));
  const always = reads([boom]);
  await assert.rejects(waitForCi(1465, waitOpts(clock(), always.read)), /GitHub API 502/);
  assert.equal(always.calls.length, 3);
});

test("US-DEV-13: the report names every job with its result and run, and ends with the verdict", () => {
  const text = report(assess(open(snapOf("pr1476"))));
  assert.match(
    text,
    /app-gates\s+success\s+required\s+run 42185065502, completed 2026-11-06T08:06:20Z/,
  );
  assert.match(text, /audit\s+cancelled\s+optional\s+run 42185269012/);
  assert.match(text, /ci-status\s+aggregate, not judged: success/);
  assert.equal(
    text.split("\n").at(-1),
    "ci-wait: green, every required job succeeded on 3f89472c.",
  );
});

test("US-DEV-13: a failed required job makes the verdict not green and the exit code 1", () => {
  const s = open(snapOf("pr1476"));
  const broken = {
    ...s,
    checkRuns: s.checkRuns.map((c) =>
      c.name === "changes" && onRun(42185354551)(c) ? { ...c, conclusion: "failure" } : c,
    ),
  };
  const a = assess(broken);
  assert.equal(exitCodeOf(a), 1);
  assert.match(report(a), /not green: changes: failure/);
});

test("US-DEV-13: a required job that was only cancelled is a problem, and a job that never ran is named", () => {
  const s = open(snapOf("pr1476"));
  const onlyCancelled = {
    ...s,
    checkRuns: s.checkRuns.filter((c) => !(c.name === "app-gates" && c.conclusion === "success")),
  };
  const a = assess(onlyCancelled);
  assert.equal(rowOf(a, "app-gates").result, "cancelled");
  assert.equal(rowOf(a, "app-gates").problem, "app-gates: cancelled");
  const neverRan = {
    ...s,
    checkRuns: s.checkRuns.filter(
      (c) => !(c.name === "app-gates" && ["success", "cancelled"].includes(c.conclusion)),
    ),
  };
  const b = assess(neverRan);
  assert.equal(rowOf(b, "app-gates").result, "never ran");
  assert.match(rowOf(b, "app-gates").problem, /never ran, but ci\.yml requires it/);
  assert.equal(exitCodeOf(b), 1);
});

test("US-DEV-13: a check run of another app with the name of a CI job does not count", () => {
  const s = open(snapOf("pr1476"));
  const faked = {
    ...s,
    checkRuns: [
      ...s.checkRuns.filter((c) => !(c.name === "app-gates" && c.conclusion === "success")),
      {
        ...s.checkRuns[0],
        name: "app-gates",
        conclusion: "success",
        app: { slug: "someone-else" },
      },
    ],
  };
  assert.notEqual(rowOf(assess(faked), "app-gates").result, "success");
});

test("US-DEV-13: a failed job the path filter does not require still fails the PR", () => {
  const s = open(snapOf("pr1476"));
  const e2e = {
    ...s,
    checkRuns: s.checkRuns.map((c) =>
      c.name === "e2e" && onRun(42185354551)(c) ? { ...c, conclusion: "failure" } : c,
    ),
  };
  const a = assess(e2e);
  assert.equal(exitCodeOf(a), 1);
  assert.deepEqual(a.problems, ["e2e: failure"]);
});

test("US-DEV-13: make merge refuses while CI runs, names the failed jobs and passes a green head", () => {
  const running = assess(asOf(open(snapOf("pr1465")), "2026-11-06T07:00:00Z"));
  assert.match(problemsNow(running)[0], /CI is still running .*app-ui.*make ci-wait PR=1465/);
  const s = open(snapOf("pr1476"));
  const failing = {
    ...s,
    checkRuns: s.checkRuns.map((c) =>
      c.name === "changes" && onRun(42185354551)(c) ? { ...c, conclusion: "failure" } : c,
    ),
  };
  assert.deepEqual(problemsNow(assess(failing)), ["CI: changes: failure"]);
  assert.deepEqual(problemsNow(assess(s)), []);
});

test("US-DEV-13: readSnapshot reads every page of the check runs over REST and the jobs of the head's ci.yml", async () => {
  const s = snapOf("pr1476");
  const many = Array.from({ length: 150 }, (_, i) => ({
    ...s.checkRuns[i % s.checkRuns.length],
    id: 1000 + i,
  }));
  const ciText =
    "on:\n  push:\njobs:\n  changes:\n    runs-on: x\n  ci-status:\n    needs: [changes]\n";
  const listText = JSON.stringify({ maxEntries: 1, entries: [QUARANTINED_LIGHTHOUSE] });
  const calls = [];
  const client = {
    async run(cmd, args) {
      const path = args[1];
      calls.push(path);
      if (path === "repos/{owner}/{repo}") return `${REPO}\n`;
      if (path === `repos/${REPO}/pulls/1476`) return JSON.stringify(fixtures.pr1476.pull);
      if (path === `repos/${REPO}/pulls/1476/files?per_page=100&page=1`)
        return JSON.stringify(s.files.map((filename) => ({ filename })));
      if (path.includes("/check-runs?")) {
        const p = Number(/[?&]page=(\d+)$/.exec(path)[1]);
        return JSON.stringify({
          total_count: many.length,
          check_runs: many.slice((p - 1) * 100, p * 100),
        });
      }
      if (path.includes("/actions/runs?"))
        return JSON.stringify({ total_count: 5, workflow_runs: s.workflowRuns });
      if (path.includes("/contents/.github/workflows/ci.yml?ref=")) {
        return JSON.stringify({ content: Buffer.from(ciText).toString("base64") });
      }
      if (path.includes("/contents/app/config/gates/baselines/quarantine-baseline.json?ref=")) {
        return JSON.stringify({ content: Buffer.from(listText).toString("base64") });
      }
      throw new Error(`unexpected call: ${path}`);
    },
  };
  const snap = await readSnapshot(client, 1476);
  assert.equal(snap.head, HEAD_1476);
  assert.equal(snap.checkRuns.length, 150);
  assert.equal(snap.workflowRuns.length, 5);
  assert.equal(snap.files.length, 3);
  assert.deepEqual([...snap.defined].sort(), ["changes", "ci-status"]);
  assert.ok(calls.some((p) => /check-runs\?filter=all&per_page=100&page=2$/.test(p)));
  assert.deepEqual(snap.quarantine, [QUARANTINED_LIGHTHOUSE], "US-QG-06: the list is read too");
});

test("US-DEV-13: a head without a ci.yml defines no job, so nothing is required from it", async () => {
  const client = {
    async run(cmd, args) {
      const path = args[1];
      if (path === "repos/{owner}/{repo}") return `${REPO}\n`;
      if (path === `repos/${REPO}/pulls/1476`) return JSON.stringify(fixtures.pr1476.pull);
      if (path.includes("/files")) return "[]";
      if (path.includes("/check-runs?")) return JSON.stringify({ total_count: 0, check_runs: [] });
      if (path.includes("/actions/runs?"))
        return JSON.stringify({ total_count: 0, workflow_runs: [] });
      throw new Error("gh: Not Found (HTTP 404)");
    },
  };
  const snap = await readSnapshot(client, 1476);
  assert.equal(snap.defined.size, 0);
  const a = assess(open(snap));
  assert.deepEqual(a.problems, ["no CI run on the head commit"]);
});

// US-DEV-13: code scanning. The fixture pr1503earlier is real: PR 1503 at its earlier head 4316b1d2, where the GitHub Advanced
// Security app failed `CodeQL` with 2 new high alerts while `make ci-wait` printed green (issue 1510). The CI jobs of that head
// are the ones the fixture keeps; the code-scanning checks are the real records of the same head.
const scanOpen = () => open(snapOf("pr1503earlier"));
const withCheck = (s, name, change) => ({
  ...s,
  checkRuns: s.checkRuns.map((c) => (c.name === name ? { ...c, ...change } : c)),
});

test("US-DEV-13: a failed CodeQL check of PR 1503's earlier head is a problem that names it", () => {
  const a = assess(scanOpen());
  assert.equal(a.status, "settled");
  assert.deepEqual(a.problems, ["CodeQL: failure"]);
  assert.equal(rowOf(a, "CodeQL").result, "failure");
  assert.equal(
    rowOf(a, "CodeQL").run,
    "127847930786",
    "a check run without an actions run is named by its id",
  );
  assert.equal(exitCodeOf(a), 1);
  assert.match(
    report(a),
    /CodeQL\s+failure\s+scanning\s+run 127847930786, completed 2026-11-06T10:41:33Z/,
  );
  assert.match(report(a), /ci-wait: not green: CodeQL: failure$/);
  assert.deepEqual(problemsNow(a), ["CI: CodeQL: failure"]);
});

test("US-DEV-13: a failed analyze check of the advanced workflow is a problem that names it", () => {
  const s = withCheck(scanOpen(), "CodeQL", { conclusion: "success" });
  const a = assess(withCheck(s, "analyze (javascript-typescript)", { conclusion: "failure" }));
  assert.deepEqual(a.problems, ["analyze (javascript-typescript): failure"]);
  assert.equal(exitCodeOf(a), 1);
  assert.match(report(a), /analyze \(javascript-typescript\)\s+failure\s+scanning\s+run /);
});

test("US-DEV-13: the green CodeQL and analyze checks of PR 1465 are judged and pass", () => {
  const a = assess(open(snapOf("pr1465")));
  assert.equal(rowOf(a, "CodeQL").result, "success");
  assert.equal(rowOf(a, "analyze (javascript-typescript)").result, "success");
  assert.equal(rowOf(a, "analyze (actions)").result, "success");
  assert.deepEqual(a.problems, []);
});

test("US-DEV-13: a PR without a CodeQL or analyze check is no problem (docs-only PRs may have none)", () => {
  const s = scanOpen();
  const none = { ...s, checkRuns: s.checkRuns.filter((c) => !/^(CodeQL|analyze )/.test(c.name)) };
  const a = assess(none);
  assert.deepEqual(a.problems, []);
  assert.equal(exitCodeOf(a), 0);
  assert.equal(rowOf(a, "CodeQL"), undefined);
});

test("US-DEV-13: a neutral, cancelled or skipped CodeQL result is no problem", () => {
  for (const conclusion of ["neutral", "cancelled", "skipped"]) {
    const a = assess(withCheck(scanOpen(), "CodeQL", { conclusion }));
    assert.deepEqual(a.problems, [], conclusion);
    assert.equal(rowOf(a, "CodeQL").result, conclusion);
  }
});

test("US-DEV-13: a CodeQL re-run that passes after the failed run is no problem", () => {
  const s = scanOpen();
  const failed = s.checkRuns.find((c) => c.name === "CodeQL");
  const rerun = {
    ...failed,
    id: failed.id + 1,
    conclusion: "success",
    started_at: "2026-11-06T10:55:00Z",
    completed_at: "2026-11-06T10:55:02Z",
    details_url: `https://github.com/${REPO}/runs/${failed.id + 1}`,
  };
  const a = assess({ ...s, checkRuns: [...s.checkRuns, rerun] });
  assert.equal(rowOf(a, "CodeQL").result, "success");
  assert.equal(rowOf(a, "CodeQL").run, String(failed.id + 1));
  assert.deepEqual(a.problems, []);
});

test("US-DEV-13: a CodeQL check that is still running keeps the PR waiting, and make merge refuses", () => {
  const running = withCheck(scanOpen(), "CodeQL", {
    status: "in_progress",
    conclusion: null,
    completed_at: null,
  });
  const a = assess(running);
  assert.equal(a.status, "running");
  assert.deepEqual(a.unfinished, ["CodeQL"]);
  assert.match(
    problemsNow(a)[0],
    /CI is still running \(CodeQL\); wait for it with make ci-wait PR=1503/,
  );
});

test("US-DEV-13: a CodeQL check of another app with the same name does not count, as with the CI jobs", () => {
  const s = scanOpen();
  const faked = {
    ...s,
    checkRuns: s.checkRuns.map((c) =>
      c.name === "CodeQL" ? { ...c, app: { slug: "someone-else" } } : c,
    ),
  };
  const a = assess(faked);
  assert.deepEqual(a.problems, []);
  assert.equal(rowOf(a, "CodeQL"), undefined);
});

test("US-DEV-13: the make gate-review state line names the failed CodeQL check of PR 1503's earlier head", () => {
  assert.equal(
    stateLine(assess(scanOpen())),
    "not green: CodeQL: failure (ci-status: success, not judged)",
  );
});

test("US-DEV-13 (issue 1608): a draft requires no job, has no job table and exits 1 with the way to start its CI", () => {
  const s = open(snapOf("pr1476"));
  const draft = { ...s, pr: { ...s.pr, draft: true } };
  assert.deepEqual(
    [...requiredJobs({ files: s.files, base: "dev", draft: true, defined: s.defined })],
    [],
  );
  const a = assess(draft);
  assert.equal(a.status, "draft");
  assert.deepEqual(a.rows, []);
  assert.equal(exitCodeOf(a), 1);
  const text = report(a);
  assert.match(text, /is a draft, and a draft has no CI run\. make pr marks it ready/);
  assert.doesNotMatch(text, /app-gates|ci-status/);
  assert.match(problemsNow(a)[0], /make pr marks it ready for review/);
});

test("US-DEV-13 (issue 1608): ci-wait ends at once on a draft, without polling", async () => {
  const s = open(snapOf("pr1476"));
  const c = clock();
  const r = reads([{ ...s, pr: { ...s.pr, draft: true } }]);
  const out = await waitForCi(1476, waitOpts(c, r.read));
  assert.equal(out.status, "draft");
  assert.equal(r.calls.length, 1);
  assert.deepEqual(c.sleeps, []);
});

test("US-DEV-13 (issue 1608): the jobs come from the ci.yml of the merge commit, which a pull_request run uses", async () => {
  const merge = "c".repeat(40);
  const pull = { ...fixtures.pr1476.pull, merge_commit_sha: merge };
  const s = snapOf("pr1476");
  const refs = [];
  const listRefs = [];
  const client = {
    async run(cmd, args) {
      const path = args[1];
      if (path === "repos/{owner}/{repo}") return `${REPO}\n`;
      if (path === `repos/${REPO}/pulls/1476`) return JSON.stringify(pull);
      if (path.includes("/files")) return JSON.stringify(s.files.map((filename) => ({ filename })));
      if (path.includes("/check-runs?")) return JSON.stringify({ total_count: 0, check_runs: [] });
      if (path.includes("/actions/runs?"))
        return JSON.stringify({ total_count: 0, workflow_runs: [] });
      const ref = /\/contents\/\.github\/workflows\/ci\.yml\?ref=(\w+)$/.exec(path);
      if (ref) {
        refs.push(ref[1]);
        const yml =
          ref[1] === merge
            ? "jobs:\n  changes:\n    runs-on: x\n"
            : "jobs:\n  ci-status:\n    needs: []\n";
        return JSON.stringify({ content: Buffer.from(yml).toString("base64") });
      }
      // US-QG-06: the quarantine list is read at the same commit (none here: the file of the merge commit has no entries).
      const list =
        /\/contents\/app\/config\/gates\/baselines\/quarantine-baseline\.json\?ref=(\w+)$/.exec(
          path,
        );
      if (list) {
        listRefs.push(list[1]);
        return JSON.stringify({
          content: Buffer.from('{ "maxEntries": 0, "entries": [] }').toString("base64"),
        });
      }
      throw new Error(`unexpected call: ${path}`);
    },
  };
  const snap = await readSnapshot(client, 1476);
  assert.deepEqual([...snap.defined], ["changes"]);
  assert.deepEqual(refs, [merge]);
  assert.deepEqual(listRefs, [merge], "US-QG-06: the list is read at the same commit as the jobs");
  assert.deepEqual(snap.quarantine, []);
});

// US-QG-02 (issue 1608): the job `results` fails for each part that failed, and for nothing else. Its last step is run here
// with the results that ci.yml gives it as environment (the needs of the job and the outcomes of its steps).
const RESULTS_LAST_STEP = "Every part that ran passed (US-QG-01, US-QG-02)";
const ALL_PASSED = {
  APP_TESTS: "success",
  APP_TESTS_WEB: "success",
  COVERAGE: "success",
  WEB_MERGE: "success",
  UI_SHARDS: "success",
  ONE_SCREEN_MERGE: "success",
  A11Y_ROUTES_MERGE: "success",
};

/** The bash of the step `name` in ci.yml: the lines of its `run: |` block, which are indented deeper than the `run:` key. */
function stepScript(ciText, name) {
  const lines = ciText.split("\n");
  const at = lines.findIndex((l) => l.trim() === `- name: ${name}`);
  assert.ok(at >= 0, `step ${name}`);
  const runAt = lines.findIndex((l, i) => i > at && l.trim() === "run: |");
  const indent = lines[runAt].indexOf("run:") + 2;
  const body = [];
  for (let i = runAt + 1; i < lines.length; i++) {
    if (lines[i].trim() !== "" && lines[i].search(/\S/) < indent) break;
    body.push(lines[i].slice(indent));
  }
  return body.join("\n");
}

const resultsOf = (parts) =>
  spawnSync("bash", ["-c", stepScript(readFileSync(CI_YML, "utf8"), RESULTS_LAST_STEP)], {
    encoding: "utf8",
    env: { PATH: process.env.PATH, ...ALL_PASSED, ...parts },
  });

test("US-QG-02 (issue 1608): the results job passes when every part that ran passed, and a part that did not run is no failure", () => {
  assert.equal(resultsOf({}).status, 0);
  const reused = { APP_TESTS: "skipped", APP_TESTS_WEB: "skipped", COVERAGE: "skipped" };
  assert.equal(resultsOf(reused).status, 0, "reused test jobs need no coverage");
  const noUi = { UI_SHARDS: "skipped", ONE_SCREEN_MERGE: "skipped", A11Y_ROUTES_MERGE: "skipped" };
  assert.equal(resultsOf(noUi).status, 0, "no UI shards ran");
});

test("US-QG-02 (issue 1608): a failed or cancelled test job fails the results job", () => {
  for (const result of ["failure", "cancelled"]) {
    const out = resultsOf({ APP_TESTS_WEB: result, COVERAGE: "skipped" });
    assert.equal(out.status, 1, result);
    assert.match(out.stderr, /test-job=/);
  }
});

test("US-QG-02 (issue 1608): the coverage ratchet fails the results job when both test jobs passed", () => {
  const out = resultsOf({ COVERAGE: "failure" });
  assert.equal(out.status, 1);
  assert.match(out.stderr, /coverage=failure/);
  assert.equal(
    resultsOf({ COVERAGE: "skipped" }).status,
    1,
    "a coverage step that did not run is a failure",
  );
});

test("US-QG-02 (issue 1682): a failed merge of the web test shards fails the results job, when both web shards passed", () => {
  const out = resultsOf({ WEB_MERGE: "failure" });
  assert.equal(out.status, 1);
  assert.match(out.stderr, /web-merge=failure/);
  assert.equal(
    resultsOf({ APP_TESTS_WEB: "skipped", WEB_MERGE: "skipped" }).status,
    0,
    "no web shards ran",
  );
});

test("US-QG-01 (issue 1608, owner decision 2026-11-07): a failed UI shard job fails the results job", () => {
  const out = resultsOf({ UI_SHARDS: "failure" });
  assert.equal(out.status, 1);
  assert.match(out.stderr, /ui-shards=failure/);
});

test("US-QG-01 (issue 1608): a one-screen merge that fails, or an a11y-routes merge that fails, fails the results job", () => {
  for (const parts of [{ ONE_SCREEN_MERGE: "failure" }, { A11Y_ROUTES_MERGE: "failure" }]) {
    const out = resultsOf(parts);
    assert.equal(out.status, 1, JSON.stringify(parts));
    assert.match(out.stderr, /(one-screen|a11y-routes)-merge=failure/);
  }
});

test("US-QG-02 (issue 1608): every failed part is named in the one message of the results job", () => {
  const out = resultsOf({
    APP_TESTS: "failure",
    COVERAGE: "skipped",
    A11Y_ROUTES_MERGE: "failure",
  });
  assert.equal(out.status, 1);
  assert.match(out.stderr, /test-job=failure/);
  assert.match(out.stderr, /a11y-routes-merge=failure/);
  assert.doesNotMatch(out.stderr, /ui-shards=/, "the shards passed");
});

// US-QG-02 (issue 1682): the web tests run as two matrix shards, named `app-tests-web (1)` and `(2)`. The verdict reads them as
// one job. The fixture PR 1476 is a UI change; its plain `app-tests-web` runs are replaced by the shard runs of each test.
/** PR 1476 with its web tests as shard runs: [check run name, conclusion] per shard, a null conclusion is still running. */
function withShards(shards) {
  const s = open(snapOf("pr1476"));
  const web = s.checkRuns.find((c) => c.name === "app-tests-web");
  const runs = shards.map(([name, conclusion], i) => ({
    ...web,
    id: web.id + i + 1,
    name,
    status: conclusion ? "completed" : "in_progress",
    conclusion: conclusion ?? null,
    completed_at: conclusion ? "2026-11-06T08:07:10Z" : null,
    details_url: `https://github.com/${REPO}/actions/runs/${9100 + i}/job/${web.id + i + 1}`,
  }));
  return { ...s, checkRuns: [...s.checkRuns.filter((c) => c.name !== "app-tests-web"), ...runs] };
}

test("US-QG-02 (issue 1682): both web test shards succeeded, so the job app-tests-web is a success", () => {
  const a = assess(
    withShards([
      ["app-tests-web (1)", "success"],
      ["app-tests-web (2)", "success"],
    ]),
  );
  assert.equal(rowOf(a, "app-tests-web").result, "success");
  assert.equal(rowOf(a, "app-tests-web").problem, null);
  assert.deepEqual(a.problems, []);
  assert.equal(exitCodeOf(a), 0);
});

// PR 1683: a title edit runs `reuse`, the matrix job is skipped unexpanded, and its one check run is the plain job name.
test("US-QG-02 (issue 1682): the skipped plain check of a text-edit run does not stand for a shard without a result", () => {
  const a = assess(
    withShards([
      ["app-tests-web (1)", "success"],
      ["app-tests-web (2)", "success"],
      ["app-tests-web", "skipped"],
    ]),
  );
  assert.equal(rowOf(a, "app-tests-web").result, "success");
  assert.deepEqual(a.problems, []);
});

test("US-QG-02 (issue 1682): a failed web test shard fails the job, although the other shard succeeded", () => {
  const a = assess(
    withShards([
      ["app-tests-web (1)", "success"],
      ["app-tests-web (2)", "failure"],
    ]),
  );
  assert.equal(rowOf(a, "app-tests-web").result, "failure");
  assert.deepEqual(a.problems, ["app-tests-web: failure"]);
  assert.equal(exitCodeOf(a), 1);
});

test("US-QG-02 (issue 1682): a cancelled web test shard is no success, although the other shard succeeded", () => {
  const a = assess(
    withShards([
      ["app-tests-web (1)", "success"],
      ["app-tests-web (2)", "cancelled"],
    ]),
  );
  assert.equal(rowOf(a, "app-tests-web").result, "cancelled");
  assert.deepEqual(a.problems, ["app-tests-web: cancelled"]);
  assert.equal(exitCodeOf(a), 1);
});

test("US-QG-02 (issue 1682): a web test shard that is still running keeps the PR waiting, and no shard counts as a success before it finished", () => {
  const a = assess(
    withShards([
      ["app-tests-web (1)", "success"],
      ["app-tests-web (2)", null],
    ]),
  );
  assert.equal(a.status, "running");
  assert.deepEqual(a.unfinished, ["app-tests-web (2)"]);
  assert.equal(rowOf(a, "app-tests-web").result, "running");
});

test("US-QG-02 (issue 1682): the shard check runs alone name a CI run, so the head is not judged as one without CI", () => {
  const only = withShards([
    ["app-tests-web (1)", "success"],
    ["app-tests-web (2)", "success"],
  ]);
  const a = assess({
    ...only,
    checkRuns: only.checkRuns.filter((c) => c.name.startsWith("app-tests-web (")),
  });
  assert.ok(!a.problems.includes("no CI run on the head commit"));
  assert.equal(rowOf(a, "app-tests-web").result, "success");
});

test("US-QG-02 (issue 1682): a plain app-tests-web check of an older head still counts, green or red", () => {
  const s = open(snapOf("pr1476"));
  const plain = s.checkRuns.find((c) => c.name === "app-tests-web");
  assert.equal(rowOf(assess(s), "app-tests-web").result, "success");
  const red = {
    ...s,
    checkRuns: [
      ...s.checkRuns.filter((c) => c.name !== "app-tests-web"),
      { ...plain, conclusion: "failure" },
    ],
  };
  const a = assess(red);
  assert.equal(rowOf(a, "app-tests-web").result, "failure");
  assert.deepEqual(a.problems, ["app-tests-web: failure"]);
});

// US-QG-06: a quarantined job reports its red result and blocks nothing, as ci-status reads it (the same list).
const quarantineOf = (...entries) =>
  entries.map((job) => ({ job, since: "2026-11-09", issue: 1748, reason: "red on dev" }));
const redTests = (s) => ({
  ...s,
  checkRuns: s.checkRuns.map((c) =>
    c.name === "app-tests-web" ? { ...c, conclusion: "failure" } : c,
  ),
});

test("US-QG-06: a red required job of the list is no problem, and the verdict names it as quarantined", () => {
  const s = open(snapOf("pr1476"));
  const a = assess({ ...redTests(s), quarantine: quarantineOf("app-tests-web") });
  assert.deepEqual(a.problems, []);
  assert.equal(a.status, "settled");
  assert.equal(exitCodeOf(a), 0);
  assert.equal(rowOf(a, "app-tests-web").excused.issue, 1748, "the entry that excuses the row");
  assert.match(report(a), /app-tests-web .* quarantined since 2026-11-09, #1748 \(report only\)/);
  assert.match(
    report(a),
    /green on .* except the quarantined jobs \(report only\): app-tests-web\./,
    "a green verdict never hides a quarantined job (P-10)",
  );
  assert.equal(
    stateLine(a),
    "green on 3f89472c, except the quarantined jobs (report only): app-tests-web (ci-status: success, not judged)",
    "the gate review names the quarantined job, it never reads as all green",
  );
});

test("US-QG-06: without the list the same red job is a problem; the list names only the job it lists", () => {
  const s = open(snapOf("pr1476"));
  assert.deepEqual(assess(redTests(s)).problems, ["app-tests-web: failure"]);
  const other = assess({ ...redTests(s), quarantine: quarantineOf("lighthouse") });
  assert.deepEqual(other.problems, ["app-tests-web: failure"]);
  assert.equal(rowOf(other, "app-tests-web").excused, null);
});

test("US-QG-06: a required job that never ran stays a problem, even when the list names it", () => {
  const s = open(snapOf("pr1476"));
  const none = { ...s, checkRuns: s.checkRuns.filter((c) => c.name !== "app-ui") };
  const a = assess({ ...none, quarantine: quarantineOf("app-ui") });
  assert.deepEqual(a.problems, ["app-ui: never ran, but ci.yml requires it for this PR"]);
});

test("US-QG-06: a list entry that names no job of the head's workflow is a problem (fail closed)", () => {
  const s = open(snapOf("pr1476"));
  const a = assess({ ...s, quarantine: quarantineOf("no-such-job") });
  assert.deepEqual(a.problems, ["quarantine list names no-such-job, which ci.yml does not define"]);
  assert.equal(exitCodeOf(a), 1);
});

test("US-QG-06: make merge is refused by a red job only when the list does not quarantine it", () => {
  const s = open(snapOf("pr1476"));
  assert.deepEqual(
    problemsNow(assess({ ...redTests(s), quarantine: quarantineOf("app-tests-web") })),
    [],
  );
  assert.deepEqual(problemsNow(assess(redTests(s))), ["CI: app-tests-web: failure"]);
});
