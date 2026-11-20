import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { test } from "node:test";
import { baselineChanges } from "../../../.claude/hooks/baseline-growth.mjs";
import { assess, JOBS, problemsNow } from "./actions/ci-reuse/verdict/ci-verdict.mjs";
import { idsIn, problems, specIds } from "./merge-pr.mjs";
import {
  dropMergedTestDb,
  testDbDirOf,
  testDbPortOf,
  worktreeOf,
} from "./worktree/local-database.mjs";

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

test("US-DEV-02: spec ids come from headings and table rows", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "specs-"));
  // The folder goes again, also when the assertion fails (#1297).
  t.after(() => rmSync(dir, { recursive: true, force: true }));
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
      { path: "app/tools/workflow/merge-pr.mjs" },
    ],
  };
  assert.match(problems(gate, known)[0], /gate files.*ci\.yml.*merge-pr\.mjs/);
});

test("US-QG-07: a PR that changes only a gate test is left to a human too: the hook asks no question for a test, make merge still refuses it", () => {
  for (const f of [
    ".claude/hooks/rules.test.mjs",
    ".claude/hooks/worktree.test.mjs",
    "app/tools/workflow/merge-pr.test.mjs",
    "app/tools/check/code/layout/layout-rules.test.mjs",
    "app/tools/workflow/actions/ci-reuse/gate-review/gate-review.test.mjs",
  ]) {
    const found = problems({ ...ok, files: [{ path: f }] }, known);
    assert.equal(found.length, 1, f);
    assert.match(found[0], /gate files, which a human must merge/, f);
    assert.ok(found[0].includes(f), f);
  }
});

test("US-QG-07: a PR that changes only app tests or product tooling tests is no gate PR, so make merge accepts it (issue 2222)", () => {
  const files = [
    "app/packages/api/src/ai/reads/areas.test.ts",
    "app/packages/web/src/app/destinations/account-area/whats-new/news-lines.test.ts",
    "app/tools/keycloak/theme.test.mjs",
  ].map((path) => ({ path }));
  assert.deepEqual(problems({ ...ok, files: [...ok.files, ...files] }, known), []);
});

test("US-QG-07: a PR that changes a threshold or an exception list is refused, a PR that only shrinks a baseline is not", () => {
  for (const f of [
    "coverage-thresholds.json",
    "quality-limits.json",
    "audit-allowlist.json",
    "conformance-allowlist.json",
  ]) {
    const pr = { ...ok, files: [{ path: `app/config/gates/${f}` }] };
    const found = problems(pr, known);
    assert.equal(found.length, 1, f);
    assert.match(found[0], /gate files/, f);
    assert.ok(found[0].includes(`app/config/gates/${f}`), f);
  }
  const shrink = { ...ok, files: [{ path: "app/config/gates/baselines/ui-text-baseline.json" }] };
  assert.deepEqual(problems(shrink, known), []);
});

const run = (conclusion, startedAt, completedAt, status = "COMPLETED") => ({
  name: "ci-status",
  status,
  conclusion,
  startedAt,
  completedAt,
});
const withRuns = (...runs) => ({ ...ok, statusCheckRollup: runs });

test("US-DEV-02: a green re-run after a cancelled run on the same commit may be merged", () => {
  const failedFirst = withRuns(
    run("FAILURE", "2026-01-01T23:14:00Z", "2026-01-01T23:14:57Z"),
    run("SUCCESS", "2026-01-01T23:15:00Z", "2026-01-01T23:16:41Z"),
  );
  assert.deepEqual(problems(failedFirst, known), []);
  const reversedOrder = withRuns(...failedFirst.statusCheckRollup.toReversed());
  assert.deepEqual(problems(reversedOrder, known), []);
});

test("US-DEV-02: a failing latest run stops the merge although an older run was green", () => {
  const pr = withRuns(
    run("SUCCESS", "2026-01-01T23:10:00Z", "2026-01-01T23:11:00Z"),
    run("FAILURE", "2026-01-01T23:15:00Z", "2026-01-01T23:16:00Z"),
  );
  assert.match(problems(pr, known)[0], /FAILURE/);
});

test("US-DEV-02: only cancelled runs stop the merge", () => {
  const pr = withRuns(
    run("CANCELLED", "2026-01-01T23:10:00Z", "2026-01-01T23:11:00Z"),
    run("CANCELLED", "2026-01-01T23:15:00Z", "2026-01-01T23:16:00Z"),
  );
  assert.match(problems(pr, known)[0], /CANCELLED/);
});

test("US-DEV-02: a pending latest run stops the merge although an older run was green", () => {
  const pr = withRuns(
    run("SUCCESS", "2026-01-01T23:10:00Z", "2026-01-01T23:11:00Z"),
    run("", "2026-01-01T23:15:00Z", "0001-01-01T00:00:00Z", "IN_PROGRESS"),
  );
  assert.equal(problems(pr, known).length, 1);
  assert.match(problems(pr, known)[0], /ci-status/);
});

test("US-DEV-02: other checks and a missing ci-status run do not count as green", () => {
  const other = withRuns({
    name: "lint",
    conclusion: "SUCCESS",
    startedAt: "2026-01-01T23:15:00Z",
  });
  assert.match(problems(other, known)[0], /not reported/);
});

// Baseline growth (US-QG-07): the versions come from the merge base and the head; the test injects them.
const UI = "app/config/gates/baselines/ui-text-baseline.json";
const ui = (count) =>
  JSON.stringify(
    { maxTotal: count, entries: [{ file: "app/packages/web/src/a.tsx", count }] },
    null,
    2,
  );
const withBaseline = (...paths) => ({
  ...ok,
  baseRefOid: "base0",
  headRefOid: "head0",
  files: [...ok.files, ...paths.map((path) => ({ path }))],
});
/** Dependencies that read `before` at the merge base and `after` at the head. */
const versions = (before, after, named = () => true) => ({
  mergeBase: () => "merge0",
  readAt: (sha) => (sha === "merge0" ? before : after),
  namedAtHead: named,
});

test("US-QG-07: a PR that grows a baseline is refused, and the refusal names the file", () => {
  const pr = withBaseline(UI);
  const found = problems(pr, known, baselineChanges(pr, versions(ui(2), ui(3))));
  assert.equal(found.length, 1);
  assert.match(found[0], /baseline grows: app\/config\/gates\/baselines\/ui-text-baseline\.json/);
  assert.match(found[0], /count rose from 2 to 3/);
});

test("US-QG-07: a PR that only shrinks baselines merges as before", () => {
  const pr = withBaseline(UI);
  assert.deepEqual(problems(pr, known, baselineChanges(pr, versions(ui(3), ui(2)))), []);
});

test("US-QG-07: a PR that adds a baseline file is refused, the file named", () => {
  const pr = withBaseline(UI);
  const found = problems(pr, known, baselineChanges(pr, versions(null, ui(1))));
  assert.match(
    found[0],
    /baseline grows: app\/config\/gates\/baselines\/ui-text-baseline\.json \(a new baseline file\)/,
  );
});

test("US-QG-07: a PR that deletes a baseline is refused while code at the head still names it, and merges when none does", () => {
  const pr = withBaseline(UI);
  const named = problems(
    pr,
    known,
    baselineChanges(
      pr,
      versions(ui(2), null, () => true),
    ),
  );
  assert.match(named[0], /deleted while its gate still names it/);
  assert.deepEqual(
    problems(
      pr,
      known,
      baselineChanges(
        pr,
        versions(ui(2), null, () => false),
      ),
    ),
    [],
  );
});

test("US-QG-07: a version that cannot be fetched refuses the PR and names the file", () => {
  const pr = withBaseline(UI);
  const changes = baselineChanges(pr, {
    mergeBase: () => "merge0",
    readAt: () => {
      throw new Error("HTTP 500");
    },
    namedAtHead: () => true,
  });
  const found = problems(pr, known, changes);
  assert.equal(found.length, 1);
  assert.match(
    found[0],
    /baseline app\/config\/gates\/baselines\/ui-text-baseline\.json: a version cannot be read \(HTTP 500\)/,
  );
});

test("US-QG-07: a merge base that cannot be found refuses every changed baseline, the files named", () => {
  const pr = withBaseline(UI);
  const changes = baselineChanges(pr, {
    mergeBase: () => {
      throw new Error("no such commit");
    },
    readAt: () => ui(1),
    namedAtHead: () => true,
  });
  assert.match(problems(pr, known, changes)[0], /ui-text-baseline\.json.*no such commit/);
});

test("US-QG-07: baseline versions are read at the merge base and at the head, and no other file is read", () => {
  const calls = [];
  const pr = withBaseline(UI);
  baselineChanges(pr, {
    mergeBase: () => "merge0",
    readAt: (sha, path) => {
      calls.push([sha, path]);
      return ui(2);
    },
    namedAtHead: () => true,
  });
  assert.deepEqual(calls, [
    ["merge0", UI],
    ["head0", UI],
  ]);
});

// US-DEV-13: the per-job reading that `make merge` adds to the ci-status check. A green ci-status of a text-edit run
// does not stand in for the full run: running, cancelled, failed or missing required jobs refuse the merge.
const REQUIRED = [
  "changes",
  "layout",
  "dependency-review",
  "metadata",
  "app-gates",
  "app-tests",
  "app-tests-web",
  "results",
  "app-ui",
  "ds-snapshots",
  "lighthouse",
];
// The jobs that `results` replaced (issue 1608): the ci.yml of the head no longer defines them, so the fixture defines every
// other job of JOBS, and a green run of an app PR needs none of them.
const RETIRED = new Set(["app-coverage", "one-screen", "a11y-routes"]);
const DEFINED = new Set(JOBS.filter((job) => !RETIRED.has(job)));
const check = (name, status, conclusion, run = 1) => ({
  name,
  status,
  conclusion,
  completed_at: status === "completed" ? "2026-01-01T10:00:00Z" : null,
  details_url: `https://github.com/PflanzenDex/PflanzenDex/actions/runs/${run}/job/1`,
  app: { slug: "github-actions" },
});
const headOf = (checkRuns, files = ["app/packages/core/src/a.ts"]) =>
  assess({
    pr: {
      number: 7,
      title: "x",
      url: "https://example.org/pr/7",
      state: "open",
      merged: false,
      mergedAt: null,
      draft: false,
      base: "dev",
      head: "abc",
      mergeable: true,
      mergeableState: "clean",
    },
    head: "abc",
    files,
    defined: DEFINED,
    checkRuns,
    workflowRuns: [],
  });
const greenRuns = () => [
  ...REQUIRED.map((name) => check(name, "completed", "success")),
  check("ci-status", "completed", "success"),
];

test("US-DEV-13: a PR whose required jobs all succeeded has no CI problem for make merge", () => {
  assert.deepEqual(problemsNow(headOf(greenRuns())), []);
});

// US-QG-02: a PR without UI needs no web tests, and an app PR needs no layout job of its own (app-gates runs the layout and
// docs checks). A failed job that is not required still refuses the merge: nothing that ran is ignored.
test("US-QG-02: a PR without UI needs no web tests, but a failed web job still refuses the merge", () => {
  const tooling = ["app/tools/workflow/merge-pr.mjs"];
  const withoutWeb = greenRuns().filter((c) => c.name !== "app-tests-web");
  assert.deepEqual(problemsNow(headOf(withoutWeb, tooling)), []);
  const failedWeb = greenRuns().map((c) =>
    c.name === "app-tests-web" ? check("app-tests-web", "completed", "failure", 2) : c,
  );
  assert.ok(problemsNow(headOf(failedWeb, tooling)).includes("CI: app-tests-web: failure"));
});

test("US-QG-02: an app PR needs no layout job of its own, app-gates runs the layout check", () => {
  assert.deepEqual(problemsNow(headOf(greenRuns().filter((c) => c.name !== "layout"))), []);
});

test("US-DEV-13: make merge refuses while a job of the full run is unfinished, although the text edit's ci-status is green", () => {
  const runs = greenRuns().map((c) =>
    c.name === "app-gates" ? check("app-gates", "in_progress", null, 2) : c,
  );
  const [problem] = problemsNow(headOf(runs));
  assert.match(problem, /^CI is still running \(app-gates\); wait for it with make ci-wait PR=7$/);
});

test("US-DEV-13: make merge refuses a required job that was cancelled in the full run", () => {
  const runs = greenRuns().map((c) =>
    c.name === "app-gates" ? check("app-gates", "completed", "cancelled", 2) : c,
  );
  assert.ok(problemsNow(headOf(runs)).includes("CI: app-gates: cancelled"));
});

test("US-DEV-13: make merge refuses a required job that failed", () => {
  const runs = greenRuns().map((c) =>
    c.name === "app-gates" ? check("app-gates", "completed", "failure", 2) : c,
  );
  assert.ok(problemsNow(headOf(runs)).includes("CI: app-gates: failure"));
});

test("US-DEV-13: make merge refuses a required job that never ran", () => {
  const runs = greenRuns().filter((c) => c.name !== "app-gates");
  assert.ok(
    problemsNow(headOf(runs)).includes(
      "CI: app-gates: never ran, but ci.yml requires it for this PR",
    ),
  );
});

// US-DEV-08 (issue 2325): after a merge, make merge removes the test database of the merged branch's worktree. `git worktree
// list --porcelain` prints the main checkout first; `make db-down` there would remove the shared test database, so it never
// counts as a worktree to clean.
const MAIN = "/work/PflanzenDex";
const LISTED = [
  `worktree ${MAIN}`,
  "HEAD 1111111",
  "branch refs/heads/dev",
  "",
  `worktree ${MAIN}/.worktrees/fix-a`,
  "HEAD 2222222",
  "branch refs/heads/fix/issue-1-a",
  "",
  `worktree ${MAIN}/.worktrees/fix-b`,
  "HEAD 3333333",
  "branch refs/heads/fix/issue-2-b",
  "",
].join("\n");

test("US-DEV-08: the linked worktree of the merged branch is found, neither the main checkout nor another worktree", () => {
  assert.equal(worktreeOf(LISTED, "fix/issue-2-b"), `${MAIN}/.worktrees/fix-b`);
  assert.equal(worktreeOf(LISTED, "fix/issue-1-a"), `${MAIN}/.worktrees/fix-a`);
});

test("US-DEV-08: a branch checked out only in the main checkout has no worktree to clean", () => {
  assert.equal(worktreeOf(LISTED, "dev"), null);
});

test("US-DEV-08: a branch without a worktree, a detached worktree, a name that only starts like another and empty output give none", () => {
  assert.equal(worktreeOf(LISTED, "fix/gone"), null);
  assert.equal(worktreeOf(LISTED, "fix/issue-2"), null);
  assert.equal(worktreeOf(LISTED, undefined), null);
  assert.equal(worktreeOf("", "fix/issue-2-b"), null);
  const detached = `worktree ${MAIN}\nHEAD 1\nbranch refs/heads/dev\n\nworktree ${MAIN}/.worktrees/fix-c\nHEAD 4444444\ndetached\n`;
  assert.equal(worktreeOf(detached, "fix/issue-3-c"), null);
});

test("US-DEV-08: a worktree names its own test database only with a port of digits in its .env.worktree", () => {
  assert.equal(testDbPortOf("PFLANZENDEX_TEST_DB_PORT=54330\n"), "54330");
  assert.equal(
    testDbPortOf("PFLANZENDEX_E2E_WEB_PORT=5173\nPFLANZENDEX_TEST_DB_PORT=54331\n"),
    "54331",
  );
  // An empty port would make db-down name the shared container `pflanzendex-test-db`, so it is no port.
  assert.equal(testDbPortOf("PFLANZENDEX_TEST_DB_PORT=\n"), null);
  assert.equal(testDbPortOf("PFLANZENDEX_TEST_DB_PORT=abc\n"), null);
  assert.equal(testDbPortOf(""), null);
  assert.equal(testDbPortOf(null), null);
});

test("US-DEV-08: the test database of a worktree is removed only when its own .env.worktree sets a port", (t) => {
  const root = mkdtempSync(join(tmpdir(), "merge-db-env-"));
  // The folder goes again, also when the assertion fails (#1297).
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const dirs = {
    withPort: join(root, "with-port"),
    noPort: join(root, "no-port"),
    noFile: join(root, "no-file"),
  };
  for (const dir of Object.values(dirs)) mkdirSync(dir);
  writeFileSync(join(dirs.withPort, ".env.worktree"), "PFLANZENDEX_TEST_DB_PORT=54330\n");
  writeFileSync(join(dirs.noPort, ".env.worktree"), "PFLANZENDEX_E2E_WEB_PORT=5173\n");
  const listed = [
    `worktree ${MAIN}`,
    "HEAD 1",
    "branch refs/heads/dev",
    "",
    ...Object.entries(dirs).flatMap(([name, dir]) => [
      `worktree ${dir}`,
      "HEAD 2",
      `branch refs/heads/${name}`,
      "",
    ]),
  ].join("\n");
  assert.equal(testDbDirOf(listed, "withPort"), dirs.withPort);
  assert.equal(testDbDirOf(listed, "noPort"), null);
  assert.equal(testDbDirOf(listed, "noFile"), null);
});

// The real db-down recipe in miniature: the same container name, the same `-` prefix, a fake docker that only logs its call.
const MAKEFILE = [
  "-include .env.worktree",
  "DB_CONTAINER := pflanzendex-test-db$(if $(PFLANZENDEX_TEST_DB_PORT),-$(PFLANZENDEX_TEST_DB_PORT))",
  "db-down:",
  "\t-docker rm -f -v $(DB_CONTAINER)",
  "",
].join("\n");
// The variables of an outer git hook (GIT_DIR in a pre-push run) would point the fixture at another checkout.
const DROPPED_GIT_VARS = new Set(["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"]);
const fixtureEnv = () =>
  Object.fromEntries(Object.entries(process.env).filter(([name]) => !DROPPED_GIT_VARS.has(name)));
function git(cwd, ...args) {
  execFileSync(
    "git",
    ["-c", "user.name=t", "-c", "user.email=t@example.org", "-c", "commit.gpgsign=false", ...args],
    { cwd, env: fixtureEnv(), stdio: "ignore" },
  );
}

/**
 * A checkout (`main`, on branch trunk) with a linked worktree (`linked`) on `branch`. The linked worktree has its own
 * .env.worktree with `port` (none when empty) and, unless `linkedMakefile` is false, the Makefile; a fake docker in `bin`
 * writes its arguments to `log`.
 */
function mergedCheckout(
  t,
  { branch = "fix/issue-2325-x", port = "54330", linkedMakefile = true } = {},
) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "merge-db-")));
  // The folder goes again, also when the assertion fails (#1297).
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const main = join(root, "main");
  const linked = join(root, "linked");
  const bin = join(root, "bin");
  const log = join(root, "docker.log");
  mkdirSync(main);
  mkdirSync(bin);
  writeFileSync(join(bin, "docker"), `#!/bin/sh\necho "$*" >> '${log}'\n`);
  chmodSync(join(bin, "docker"), 0o755);
  git(main, "init", "-q", "-b", "trunk");
  writeFileSync(join(main, "Makefile"), MAKEFILE);
  git(main, "add", "Makefile");
  git(main, "commit", "-q", "-m", "init");
  git(main, "worktree", "add", "-q", "-b", branch, linked);
  if (port) writeFileSync(join(linked, ".env.worktree"), `PFLANZENDEX_TEST_DB_PORT=${port}\n`);
  if (!linkedMakefile) rmSync(join(linked, "Makefile"));
  return { root, main, linked, bin, log, branch };
}

/** Runs `fn` with the fake docker first on PATH; the PATH is restored afterwards. */
function withFakeDocker(fixture, fn) {
  const before = process.env.PATH;
  process.env.PATH = `${fixture.bin}${delimiter}${before}`;
  try {
    return fn();
  } finally {
    process.env.PATH = before;
  }
}

test("US-DEV-08: after a merge, make db-down runs in the merged branch's worktree and only there, and one line names it", (t) => {
  const f = mergedCheckout(t);
  const line = withFakeDocker(f, () => dropMergedTestDb(f.branch, f.main));
  assert.equal(line, `merge-pr: removed the test database of ${f.linked} (make db-down)`);
  assert.equal(readFileSync(f.log, "utf8"), "rm -f -v pflanzendex-test-db-54330\n");
});

test("US-DEV-08: a branch checked out only in the main checkout, or a worktree without a port, leaves the shared database alone and the merge silent", (t) => {
  const onMain = mergedCheckout(t);
  assert.equal(
    withFakeDocker(onMain, () => dropMergedTestDb("trunk", onMain.main)),
    null,
  );
  assert.equal(existsSync(onMain.log), false, "docker must not run for the main checkout");
  const noPort = mergedCheckout(t, { port: "" });
  assert.equal(
    withFakeDocker(noPort, () => dropMergedTestDb(noPort.branch, noPort.main)),
    null,
  );
  assert.equal(existsSync(noPort.log), false, "docker must not run without a port");
});

test("US-DEV-08: a failing make, a failing git and a missing branch leave the merge silent: nothing throws", (t) => {
  const noMakefile = mergedCheckout(t, { linkedMakefile: false });
  assert.equal(
    withFakeDocker(noMakefile, () => dropMergedTestDb(noMakefile.branch, noMakefile.main)),
    null,
  );
  assert.equal(existsSync(noMakefile.log), false);
  // A folder that is no checkout: git worktree list fails.
  assert.equal(
    withFakeDocker(noMakefile, () => dropMergedTestDb(noMakefile.branch, noMakefile.root)),
    null,
  );
  assert.equal(dropMergedTestDb(undefined, noMakefile.main), null);
});
