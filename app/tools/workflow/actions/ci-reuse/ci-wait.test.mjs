// US-DEV-10: the CI result of a pull request as `make ci-wait` reads it. The fixtures are real records of PR 1465 and PR 1476
// (ci-wait.fixtures.json: pull request, changed files, check runs, workflow runs, and the jobs of the head's ci.yml, trimmed
// to the fields that the reading uses; read 2026-11-06). A state "at a time" is made from those final records.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { report } from "./ci-report.mjs";
import {
  assess,
  evidenceOf,
  exitCodeOf,
  JOBS,
  jobsDefinedIn,
  PATHS,
  problemsNow,
  pullOf,
  requiredJobs,
} from "./ci-verdict.mjs";
import { readSnapshot, waitForCi } from "./ci-wait.mjs";

const fixtures = JSON.parse(
  readFileSync(new URL("./ci-wait.fixtures.json", import.meta.url), "utf8"),
);
const CI_YML = new URL("../../../../../.github/workflows/ci.yml", import.meta.url);
const REPO = "PflanzenDex/PflanzenDex";
const HEAD_1476 = "3f89472cfb96da8676a80d87e76f7dd0c9b6dfbe";

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

// US-QG-01 (issue 1485): the matrix shards of one-screen and a11y-routes are jobs of their own in ci.yml. Their check runs are
// named "<gate> shard <n>", so the verdict cannot read them by job name; their result reaches the verdict through the
// aggregate job of the gate (`one-screen`, `a11y-routes`), which needs every shard and fails unless all of them passed.
const MATRIX_SHARDS = ["a11y-routes-shard", "one-screen-shard"];

test("US-DEV-10: the judged jobs are the jobs of ci.yml, ci-status and the matrix shards excluded", () => {
  const defined = jobsDefinedIn(readFileSync(CI_YML, "utf8"));
  assert.deepEqual([...defined].sort(), [...JOBS, "ci-status", ...MATRIX_SHARDS].sort());
});

test("US-QG-01: every matrix shard is needed by its aggregate job, and that job is judged", () => {
  const text = readFileSync(CI_YML, "utf8");
  for (const shard of MATRIX_SHARDS) {
    const aggregate = shard.replace(/-shard$/, "");
    assert.ok(JOBS.includes(aggregate), aggregate);
    const block = text.slice(text.indexOf(`\n  ${aggregate}:\n`));
    const needs = block.split("\n").find((line) => line.startsWith("    needs:"));
    assert.ok(needs?.includes(shard), `${aggregate} needs ${shard}: ${needs}`);
  }
});

test("US-DEV-10: the path filters are the ones that the changes job of ci.yml uses, with the same text", () => {
  const text = readFileSync(CI_YML, "utf8");
  // RegExp.source escapes the slashes; ci.yml writes them plain.
  for (const re of Object.values(PATHS)) {
    const pattern = re.source.replaceAll("\\/", "/");
    assert.ok(text.includes(pattern), pattern);
  }
});

test("US-DEV-10: the path filters match the same files as the changes job", () => {
  assert.ok(PATHS.app.test(".claude/hooks/rules.mjs"));
  assert.ok(PATHS.docs.test("README.md"));
  assert.ok(PATHS.docs.test("app/src/notes.md"));
  assert.ok(PATHS.app.test("app/config/gates/coverage-thresholds.json"));
  assert.ok(PATHS.oneScreen.test("app/config/gates/coverage-thresholds.json"));
  assert.ok(!PATHS.oneScreen.test("app/packages/api/src/a.ts"));
  assert.ok(!PATHS.docs.test("app/packages/api/src/a.ts"));
});

test("US-DEV-10: jobsDefinedIn reads the jobs under jobs: and not the triggers under on:", () => {
  const yml =
    "on:\n  push:\n  pull_request:\njobs:\n  changes:\n    runs-on: x\n    steps:\n      - run: y\n  ci-status:\n    needs: [changes]\n";
  assert.deepEqual([...jobsDefinedIn(yml)], ["changes", "ci-status"]);
});

test("US-DEV-10: the jobs required for a PR follow the path filter, the draft state and the base branch", () => {
  const defined = new Set(JOBS);
  const docsOnly = requiredJobs({ files: ["docs/x.md"], base: "dev", draft: false, defined });
  assert.ok(docsOnly.has("docs-gates"));
  assert.ok(!docsOnly.has("app-gates") && !docsOnly.has("one-screen"));
  const core = requiredJobs({
    files: ["app/packages/core/src/a.ts"],
    base: "dev",
    draft: true,
    defined,
  });
  assert.ok(core.has("app-gates") && core.has("lighthouse"));
  assert.ok(!core.has("one-screen") && !core.has("metadata") && !core.has("audit"));
  const ui = requiredJobs({
    files: ["app/packages/web/src/x.tsx"],
    base: "main",
    draft: false,
    defined,
  });
  assert.ok(ui.has("one-screen") && ui.has("a11y-routes") && ui.has("audit") && ui.has("e2e"));
});

test("US-DEV-10: when GitHub lists 3000 files, every path filter counts as matched", () => {
  const files = Array.from({ length: 3000 }, () => "x.txt");
  const req = requiredJobs({ files, base: "dev", draft: false, defined: new Set(JOBS) });
  assert.ok(req.has("app-gates") && req.has("one-screen") && req.has("docs-gates"));
});

test("US-DEV-10: a job that the head's workflow does not define is never required (PR 1465 predates docs-gates)", () => {
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
  assert.ok(ifDefined.has("docs-gates"), "docs/ changed, so the job is required where it exists");
});

test("US-DEV-10: PR 1476 requires the app, UI and docs jobs of its own workflow, but not the main-only ones", () => {
  const s = snapOf("pr1476");
  const required = requiredJobs({ files: s.files, base: "dev", draft: false, defined: s.defined });
  for (const job of [
    "app-gates",
    "app-coverage",
    "lighthouse",
    "one-screen",
    "a11y-routes",
    "docs-gates",
    "metadata",
  ]) {
    assert.ok(required.has(job), job);
  }
  assert.ok(!required.has("audit") && !required.has("e2e"));
});

test("US-DEV-10: the latest finished run that did work decides; skipped and cancelled runs are no result", () => {
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

test("US-DEV-10: a cancelled run after a success does not turn the job red (PR 1476 app-gates, app-coverage)", () => {
  const a = assess(open(snapOf("pr1476")));
  assert.equal(rowOf(a, "app-gates").result, "success");
  assert.equal(rowOf(a, "app-gates").run, "42185065502");
  assert.equal(rowOf(a, "app-coverage").result, "success");
});

test("US-DEV-10: a job skipped by the text-edit run keeps the result of the full run (PR 1465 a11y-routes)", () => {
  const row = rowOf(assess(open(snapOf("pr1465"))), "a11y-routes");
  assert.equal(row.result, "success");
  assert.equal(row.run, "42177736005");
});

test("US-DEV-10: the green ci-status of a text edit does not count while the full run of PR 1465 is still going", () => {
  const a = assess(open(asOf(snapOf("pr1465"), "2026-11-06T07:00:00Z")));
  assert.equal(a.status, "running");
  assert.ok(a.unfinished.includes("app-ui"));
  assert.equal(a.aggregate.conclusion, "success", "the aggregate of the text edit is green");
});

test("US-DEV-10: PR 1465 and PR 1476 are green once every run of their head is final", () => {
  for (const key of ["pr1465", "pr1476"]) {
    const a = assess(open(snapOf(key)));
    assert.equal(a.status, "settled", key);
    assert.deepEqual(a.problems, [], key);
    assert.equal(exitCodeOf(a), 0, key);
  }
});

test("US-DEV-10: a queued workflow run keeps the PR waiting before its check runs exist (PR 1476 at 08:07)", () => {
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

test("US-DEV-10: a merged PR is reported as merged and is not waited for (PR 1465)", async () => {
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

test("US-DEV-10: a conflicting PR fails at once, because it gets no CI run", async () => {
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

test("US-DEV-10: a PR closed without a merge fails", () => {
  const s = snapOf("pr1465");
  const a = assess({ ...s, pr: { ...s.pr, merged: false, mergedAt: null, state: "closed" } });
  assert.equal(a.status, "closed");
  assert.equal(exitCodeOf(a), 1);
});

test("US-DEV-10: mergeability that GitHub has not computed yet keeps the wait going", () => {
  const s = open(snapOf("pr1476"));
  assert.equal(assess({ ...s, pr: { ...s.pr, mergeable: null } }).status, "computing");
});

test("US-DEV-10: the wait ends only once the PR stayed quiet for the settle time", async () => {
  const c = clock();
  const r = reads([open(snapOf("pr1476"))]);
  const out = await waitForCi(1476, waitOpts(c, r.read));
  assert.equal(out.status, "settled");
  assert.equal(r.calls.length, 3, "polls at 0, 30 and 60 s");
  assert.equal(c.t, 60_000);
});

test("US-DEV-10: a run that starts during the settle time starts the settle time again", async () => {
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

test("US-DEV-10: a new head commit starts the settle time again", async () => {
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

test("US-DEV-10: the timeout ends the wait and names the unfinished checks", async () => {
  const running = open(asOf(snapOf("pr1465"), "2026-11-06T07:00:00Z"));
  const c = clock();
  const r = reads([running]);
  const out = await waitForCi(1465, waitOpts(c, r.read, 90_000));
  assert.equal(out.status, "timeout");
  assert.equal(exitCodeOf(out), 1);
  assert.match(report(out), /timed out after 2 min; still open: .*app-ui/);
});

test("US-DEV-10: one failed read is retried, three failed reads in a row stop the wait", async () => {
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

test("US-DEV-10: the report names every job with its result and run, and ends with the verdict", () => {
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

test("US-DEV-10: a failed required job makes the verdict not green and the exit code 1", () => {
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

test("US-DEV-10: a required job that was only cancelled is a problem, and a job that never ran is named", () => {
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

test("US-DEV-10: a check run of another app with the name of a CI job does not count", () => {
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

test("US-DEV-10: a failed job the path filter does not require still fails the PR", () => {
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

test("US-DEV-10: make merge refuses while CI runs, names the failed jobs and passes a green head", () => {
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

test("US-DEV-10: readSnapshot reads every page of the check runs over REST and the jobs of the head's ci.yml", async () => {
  const s = snapOf("pr1476");
  const many = Array.from({ length: 150 }, (_, i) => ({
    ...s.checkRuns[i % s.checkRuns.length],
    id: 1000 + i,
  }));
  const ciText =
    "on:\n  push:\njobs:\n  changes:\n    runs-on: x\n  ci-status:\n    needs: [changes]\n";
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
});

test("US-DEV-10: a head without a ci.yml defines no job, so nothing is required from it", async () => {
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
