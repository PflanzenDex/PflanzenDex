// US-DEV-13, issue 1716: the five read-only make targets (run-jobs, conflicts, test-files, format-check, board-item), their
// refusals, and their Makefile and permission wiring. The CLI runs with a fake gh, npx and git first on PATH (every call logged,
// no network), except the `conflicts` runs, which use the real git on local repositories in temp folders (no network).
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const CLI = fileURLToPath(new URL("./read-only-cli.mjs", import.meta.url));
const ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));
const APP = join(ROOT, "app");
const SHEBANG = `#!${process.execPath}\n`;

// The fake gh: logs its arguments, answers with the route whose key (the first repos/ path with its query, or graphql) matches.
const FAKE_GH =
  SHEBANG +
  String.raw`"use strict";
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify({ cmd: "gh", args }) + "\n");
const key = args.find((a) => a.startsWith("repos/") || a === "graphql") ?? "";
const routes = JSON.parse(fs.readFileSync(process.env.FAKE_ROUTES, "utf8"));
const hit = routes.find((r) => r.key === key);
if (!hit) {
  process.stderr.write("fake gh: no route for " + key + "\n");
  process.exit(1);
}
process.stderr.write(hit.stderr ?? "");
process.stdout.write(hit.stdout ?? "");
process.exit(hit.code ?? 0);
`;

// The fake npx: logs the call with its folder; --file-info answers from FAKE_INFO (by file name); otherwise exits FAKE_EXIT.
const FAKE_NPX =
  SHEBANG +
  String.raw`"use strict";
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify({ cmd: "npx", cwd: process.cwd(), args }) + "\n");
const at = args.indexOf("--file-info");
if (at >= 0) {
  const infos = JSON.parse(process.env.FAKE_INFO ?? "{}");
  const info = infos[path.basename(args[at + 1])] ?? { ignored: false, inferredParser: "markdown" };
  process.stdout.write(JSON.stringify(info));
  process.exit(0);
}
process.exit(Number(process.env.FAKE_EXIT ?? 0));
`;

// The fake git: logs the call and fails, so a call that should not happen shows in the log and in the exit code.
const FAKE_GIT =
  SHEBANG +
  String.raw`"use strict";
const fs = require("node:fs");
fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify({ cmd: "git", args: process.argv.slice(2) }) + "\n");
process.exit(1);
`;

const REPO = { key: "repos/{owner}/{repo}", stdout: "PflanzenDex/PflanzenDex\n" };
const RUN_JOBS = "repos/PflanzenDex/PflanzenDex/actions/runs/42/jobs?per_page=100&page=1";
const RUN_JOBS_PAGE2 = "repos/PflanzenDex/PflanzenDex/actions/runs/42/jobs?per_page=100&page=2";
const job = (name, status, conclusion, n = 1) => ({
  name,
  status,
  conclusion,
  html_url: `https://github.com/PflanzenDex/PflanzenDex/actions/runs/42/job/${n}`,
});
const BOARD_ITEMS = {
  data: {
    repository: {
      issue: {
        projectItems: {
          nodes: [
            {
              id: "PVTI_other",
              project: { number: 9, owner: { login: "PflanzenDex" } },
              status: { name: "Done" },
              typ: null,
              epic: null,
              priority: null,
              release: null,
            },
            {
              id: "PVTI_ours",
              project: { number: 2, owner: { login: "PflanzenDex" } },
              status: { name: "Todo" },
              typ: { name: "Enabler" },
              epic: { name: "DEV" },
              priority: { name: "P1" },
              release: { name: "R2" },
            },
          ],
        },
      },
    },
  },
};

/** A folder with the fakes; removed after the test, also when an assertion fails (#1297). */
function scratch(t) {
  const dir = mkdtempSync(join(tmpdir(), "read-only-1716-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, "package.json"), '{"type":"commonjs"}\n');
  for (const [name, text] of [
    ["gh", FAKE_GH],
    ["npx", FAKE_NPX],
    ["git", FAKE_GIT],
  ]) {
    writeFileSync(join(dir, name), text, { mode: 0o755 });
  }
  return dir;
}

/** The calls the fakes logged in `dir` since the last run, one object per call. */
function callsOf(dir) {
  const log = join(dir, "calls.log");
  return existsSync(log)
    ? readFileSync(log, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    : [];
}

/** Runs the CLI with the fakes first on PATH; ENV holds the inputs (REST_* and RAW_FILES) and the fakes' answers. */
function cli(dir, command, { env = {}, routes = [], cwd = ROOT } = {}) {
  writeFileSync(join(dir, "routes.json"), JSON.stringify([REPO, ...routes]));
  rmSync(join(dir, "calls.log"), { force: true });
  const res = spawnSync(process.execPath, [CLI, command], {
    encoding: "utf8",
    cwd,
    env: {
      PATH: dir,
      FAKE_LOG: join(dir, "calls.log"),
      FAKE_ROUTES: join(dir, "routes.json"),
      ...env,
    },
  });
  return { code: res.status, out: res.stdout, err: res.stderr, calls: callsOf(dir) };
}

/**
 * Runs the real make target from the repository root with the fakes first on PATH. The values reach bash through the
 * environment (M_<NAME>) and are quoted there, so the shell hands them to make byte for byte (the idiom of rest-cli.test.mjs).
 */
function make(dir, target, vars = {}, { flags = "-s", routes = [], env = {} } = {}) {
  writeFileSync(join(dir, "routes.json"), JSON.stringify([REPO, ...routes]));
  rmSync(join(dir, "calls.log"), { force: true });
  const names = Object.keys(vars);
  const command = [`make ${flags} ${target}`, ...names.map((k) => `${k}="$M_${k}"`)].join(" ");
  const res = spawnSync("bash", ["-c", command], {
    encoding: "utf8",
    cwd: ROOT,
    env: {
      PATH: `${dir}:${dirname(process.execPath)}:${process.env.PATH}`,
      FAKE_LOG: join(dir, "calls.log"),
      FAKE_ROUTES: join(dir, "routes.json"),
      ...env,
      ...Object.fromEntries(names.map((k) => [`M_${k}`, vars[k]])),
    },
  });
  // The Makefile itself runs `git rev-parse --git-common-dir` while it is read (AUTH_DIR); that probe is no call of the target.
  const probe = (c) => c.cmd === "git" && c.args.join(" ") === "rev-parse --git-common-dir";
  return {
    code: res.status,
    out: res.stdout,
    err: res.stderr,
    calls: callsOf(dir).filter((c) => !probe(c)),
  };
}

/** The environment of a real git call: the caller's, without GIT_* variables (a hook may set them), with a commit identity. */
function gitEnv() {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_")),
  );
  return {
    ...env,
    GIT_AUTHOR_NAME: "t",
    GIT_AUTHOR_EMAIL: "t@example.test",
    GIT_COMMITTER_NAME: "t",
    GIT_COMMITTER_EMAIL: "t@example.test",
  };
}

function git(cwd, args) {
  return execFileSync("git", args, { cwd, env: gitEnv(), encoding: "utf8" });
}

/**
 * A local bare origin with dev, the head of PR 5 under refs/pull/5/head (based on the first commit of dev), and a clone of it.
 * prText and devText are the new content of base.txt on the PR head and on dev.
 */
function originWithPr(t, { prText, devText }) {
  const root = mkdtempSync(join(tmpdir(), "read-only-conflicts-1716-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bare = join(root, "origin.git");
  const seed = join(root, "seed");
  const clone = join(root, "clone");
  git(root, ["init", "-q", "--bare", "-b", "dev", bare]);
  git(root, ["init", "-q", "-b", "dev", seed]);
  const commit = (text) => {
    writeFileSync(join(seed, "base.txt"), text);
    git(seed, ["add", "base.txt"]);
    git(seed, ["commit", "-q", "-m", "change"]);
  };
  commit("one\ntwo\nthree\n");
  git(seed, ["push", "-q", bare, "dev"]);
  git(seed, ["checkout", "-q", "-b", "feature"]);
  commit(prText);
  git(seed, ["push", "-q", bare, "feature:refs/pull/5/head"]);
  git(seed, ["checkout", "-q", "dev"]);
  commit(devText);
  git(seed, ["push", "-q", bare, "dev"]);
  git(root, ["clone", "-q", bare, clone]);
  return clone;
}

/** The branches and HEAD of a repository: what `conflicts` must leave as it found them. */
function branchesAndHead(dir) {
  return (
    git(dir, ["for-each-ref", "--format=%(refname) %(objectname)", "refs/heads"]) +
    git(dir, ["rev-parse", "HEAD"])
  );
}

const BAD_NUMBERS = [
  "",
  "0",
  "-3",
  "abc",
  "1.5",
  "5x",
  "1;touch M",
  "$(touch M)",
  "`touch M`",
  "12 13",
  "-12",
];

test("US-DEV-13 issue 1716 run-jobs prints the name, status, conclusion and URL of every job, over every page of the run", (t) => {
  const page1 = {
    total_count: 102,
    jobs: Array.from({ length: 100 }, (_, i) => job(`job-${i}`, "completed", "success", i)),
  };
  const page2 = {
    total_count: 102,
    jobs: [job("last", "in_progress", null, 101), job("gate", "completed", "failure", 102)],
  };
  const routes = [
    { key: RUN_JOBS, stdout: JSON.stringify(page1) },
    { key: RUN_JOBS_PAGE2, stdout: JSON.stringify(page2) },
  ];
  const r = cli(scratch(t), "run-jobs", { env: { REST_RUN: "42" }, routes });
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /^RUN 42: 102 jobs$/m);
  assert.match(
    r.out,
    /^ {2}job-0: completed, success {2}https:\/\/github\.com\/PflanzenDex\/PflanzenDex\/actions\/runs\/42\/job\/0$/m,
  );
  assert.match(r.out, /^ {2}last: in_progress, no conclusion yet {2}https:/m);
  assert.match(r.out, /^ {2}gate: completed, failure {2}https:/m);
  assert.ok(
    r.calls.some((c) => c.args.includes(RUN_JOBS_PAGE2)),
    "the second page is read",
  );
});

test("US-DEV-13 issue 1716 run-jobs exits 1 and says so when GitHub has no such run", (t) => {
  const missing = { key: RUN_JOBS, code: 1, stderr: "gh: Not Found (HTTP 404)" };
  const r = cli(scratch(t), "run-jobs", { env: { REST_RUN: "42" }, routes: [missing] });
  assert.equal(r.code, 1);
  assert.match(r.err, /HTTP 404/);
});

test("US-DEV-13 issue 1716 run-jobs, board-item and conflicts refuse a number that is not a positive whole number before any call", (t) => {
  const dir = scratch(t);
  const marker = join(dir, "touched");
  for (const [command, key] of [
    ["run-jobs", "REST_RUN"],
    ["board-item", "REST_ISSUE"],
    ["conflicts", "REST_PR"],
  ]) {
    for (const bad of BAD_NUMBERS) {
      const r = cli(dir, command, { env: { [key]: bad } });
      assert.equal(r.code, 2, `${command} ${JSON.stringify(bad)}: ${r.err}`);
      assert.match(r.err, /must be a positive whole number/, command);
      assert.deepEqual(r.calls, [], `${command} ${JSON.stringify(bad)}: no gh or git call`);
    }
    const none = cli(dir, command);
    assert.equal(none.code, 2, `${command} without a number`);
    assert.deepEqual(none.calls, [], `${command} without a number: no call`);
  }
  assert.equal(existsSync(marker), false, "a value was run as a command");
});

test("US-DEV-13 issue 1716 test-files and format-check refuse a file list with a command, a leading dash, a quote, a space or .. before any run", (t) => {
  const dir = scratch(t);
  const bad = [
    "-x.test.ts",
    "app/packages/core/src/account/account.test.ts;touch M",
    "app/packages/core/src/account/$(id).test.ts",
    "app/packages/core/src/account/`id`.test.ts",
    "app/packages/core/src/account/a'b.test.ts",
    "app/packages/core/src/a b.test.ts",
    "app/packages/core/src/account/../../../../../Makefile.test.ts",
  ];
  for (const command of ["test-files", "format-check"]) {
    for (const value of bad) {
      const r = cli(dir, command, { env: { RAW_FILES: value } });
      assert.equal(r.code, 2, `${command} ${JSON.stringify(value)}: ${r.err}`);
      assert.deepEqual(r.calls, [], `${command} ${JSON.stringify(value)}: no npx call`);
    }
  }
});

test("US-DEV-13 issue 1716 test-files refuses a path outside app/, a missing file, a non-test name and an e2e file, and runs nothing", (t) => {
  const dir = scratch(t);
  const refused = [
    "Makefile",
    "docs/guides/reference/app.md",
    "/etc/passwd",
    "app/packages/core/src/account/nope.test.ts",
    "app/packages/core/src/account/account.ts",
    "app/packages/e2e/tests/light.spec.ts",
    "app/config/gates/quality-limits.json",
    "app/tools/dev/agent/read-only/read-only-lib.mjs",
    "app/packages/core/.env",
  ];
  for (const value of refused) {
    const r = cli(dir, "test-files", { env: { RAW_FILES: value } });
    assert.equal(r.code, 2, `${value}: ${r.err}`);
    assert.deepEqual(r.calls, [], `${value}: no vitest run`);
  }
});

test("US-DEV-13 issue 1716 test-files runs vitest in the package of each file, one argument per file, and exits with its code", (t) => {
  const dir = scratch(t);
  const core = "app/packages/core/src/account/account.test.ts";
  const web = "app/packages/web/src/shared/lib/utils.test.ts";
  const r = cli(dir, "test-files", { env: { RAW_FILES: `${core} ${web}` } });
  assert.equal(r.code, 0, r.err);
  const runs = r.calls.filter((c) => c.cmd === "npx");
  assert.equal(runs.length, 2, "one vitest run per package");
  const coreRun = runs.find((c) => c.args.includes(join(ROOT, core)));
  assert.deepEqual(coreRun.args, ["--no-install", "vitest", "run", join(ROOT, core)]);
  assert.equal(coreRun.cwd, join(APP, "packages", "core"));
  const webRun = runs.find((c) => c.args.includes(join(ROOT, web)));
  assert.deepEqual(webRun.args, ["--no-install", "vitest", "run", join(ROOT, web)]);
  assert.equal(webRun.cwd, join(APP, "packages", "web"));

  const failing = cli(dir, "test-files", { env: { RAW_FILES: core, FAKE_EXIT: "1" } });
  assert.equal(failing.code, 1, "a failing test run exits 1");
});

test("US-DEV-13 issue 1716 format-check runs prettier --check with the repo config on each file and never --write", (t) => {
  const dir = scratch(t);
  const doc = "docs/guides/reference/app.md";
  const r = cli(dir, "format-check", { env: { RAW_FILES: doc } });
  assert.equal(r.code, 0, r.err);
  const check = r.calls.find((c) => c.args.includes("--check"));
  assert.deepEqual(check.args, [
    "--no-install",
    "prettier",
    "--check",
    "--config",
    ".prettierrc.json",
    join(ROOT, doc),
  ]);
  assert.equal(check.cwd, APP, "the repo config is read from app/");
  assert.ok(
    r.calls.every((c) => !c.args.includes("--write")),
    "nothing is written",
  );

  const failing = cli(dir, "format-check", { env: { RAW_FILES: doc, FAKE_EXIT: "1" } });
  assert.equal(failing.code, 1, "a file that is not formatted exits 1");
});

test("US-DEV-13 issue 1716 format-check refuses an ignored file, a file without a parser, a missing file and a path outside the folders it checks", (t) => {
  const dir = scratch(t);
  const ignored = cli(dir, "format-check", {
    env: {
      RAW_FILES: "app/package-lock.json",
      FAKE_INFO: JSON.stringify({ "package-lock.json": { ignored: true, inferredParser: null } }),
    },
  });
  assert.equal(ignored.code, 2, ignored.err);
  assert.match(ignored.err, /ignored by app\/\.prettierignore/);
  assert.ok(
    ignored.calls.every((c) => !c.args.includes("--check")),
    "no check of an ignored file",
  );

  const noParser = cli(dir, "format-check", {
    env: {
      RAW_FILES: "tools/lighthouse/lighthouse-run.sh",
      FAKE_INFO: JSON.stringify({ "lighthouse-run.sh": { ignored: false, inferredParser: null } }),
    },
  });
  assert.equal(noParser.code, 2);
  assert.match(noParser.err, /no Prettier parser/);

  for (const value of ["Makefile", "app/config/dev/.env", "docs/nope.md", "docs/../Makefile"]) {
    const r = cli(dir, "format-check", { env: { RAW_FILES: value } });
    assert.equal(r.code, 2, `${value}: ${r.err}`);
    assert.ok(
      r.calls.every((c) => !c.args.includes("--check")),
      `${value}: nothing checked`,
    );
  }
});

test("US-DEV-13 issue 1716 board-item prints Status, Typ, Epic, Priority and Release of the issue on project 2, with one read-only query", (t) => {
  const dir = scratch(t);
  const r = cli(dir, "board-item", {
    env: { REST_ISSUE: "1716" },
    routes: [{ key: "graphql", stdout: JSON.stringify(BOARD_ITEMS) }],
  });
  assert.equal(r.code, 0, r.err);
  assert.equal(
    r.out.trim(),
    [
      'ISSUE #1716 on the board "PflanzenDex Roadmap"',
      "  Status: Todo",
      "  Typ: Enabler",
      "  Epic: DEV",
      "  Priority: P1",
      "  Release: R2",
    ].join("\n"),
  );
  const graphql = r.calls.filter((c) => c.args.includes("graphql"));
  assert.equal(graphql.length, 1, "one query for one issue");
  assert.ok(graphql[0].args.includes("number=1716"), "the issue number goes as a variable");
  assert.ok(!graphql[0].args.join(" ").includes("mutation"), "the query writes nothing");
});

test("US-DEV-13 issue 1716 board-item says so when the issue is not on the board, and exits 1 for an unknown issue", (t) => {
  const dir = scratch(t);
  const off = { data: { repository: { issue: { projectItems: { nodes: [] } } } } };
  const notOnBoard = cli(dir, "board-item", {
    env: { REST_ISSUE: "1716" },
    routes: [{ key: "graphql", stdout: JSON.stringify(off) }],
  });
  assert.equal(notOnBoard.code, 0, notOnBoard.err);
  assert.match(notOnBoard.out, /is not on the board "PflanzenDex Roadmap"/);

  const unknown = { data: { repository: { issue: null } } };
  const failed = cli(dir, "board-item", {
    env: { REST_ISSUE: "99999" },
    routes: [{ key: "graphql", stdout: JSON.stringify(unknown) }],
  });
  assert.equal(failed.code, 1);
  assert.match(failed.err, /issue #99999 not found/);
});

test("US-DEV-13 issue 1716 conflicts prints clean when the PR head merges into origin/dev, and writes no branch and no HEAD", (t) => {
  const clone = originWithPr(t, { prText: "ONE\ntwo\nthree\n", devText: "one\ntwo\nTHREE\n" });
  const before = branchesAndHead(clone);
  const r = spawnSync(process.execPath, [CLI, "conflicts"], {
    encoding: "utf8",
    cwd: clone,
    env: { ...gitEnv(), REST_PR: "5" },
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^clean: PR #5 \(head [0-9a-f]{7}\) merges into origin\/dev$/m);
  assert.equal(branchesAndHead(clone), before, "no branch or HEAD changed");
});

test("US-DEV-13 issue 1716 conflicts exits 1 and names the conflicting file when the PR head conflicts with origin/dev", (t) => {
  const clone = originWithPr(t, { prText: "FEATURE\ntwo\nthree\n", devText: "DEV\ntwo\nthree\n" });
  const before = branchesAndHead(clone);
  const r = spawnSync(process.execPath, [CLI, "conflicts"], {
    encoding: "utf8",
    cwd: clone,
    env: { ...gitEnv(), REST_PR: "5" },
  });
  assert.equal(r.status, 1, r.stderr);
  assert.match(
    r.stdout,
    /^conflicts: PR #5 \(head [0-9a-f]{7}\) does not merge into origin\/dev, in:$/m,
  );
  assert.match(r.stdout, /^ {2}base\.txt$/m);
  assert.equal(branchesAndHead(clone), before, "no branch or HEAD changed");
});

test("US-DEV-13 issue 1716 conflicts exits 1 when GitHub has no PR with that number, and writes no ref", (t) => {
  const clone = originWithPr(t, { prText: "ONE\ntwo\nthree\n", devText: "one\ntwo\nTHREE\n" });
  const before = branchesAndHead(clone);
  const r = spawnSync(process.execPath, [CLI, "conflicts"], {
    encoding: "utf8",
    cwd: clone,
    env: { ...gitEnv(), REST_PR: "9" },
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /read-only: /);
  assert.equal(branchesAndHead(clone), before);
});

test("US-DEV-13 issue 1716 make passes RUN as one raw value: run-jobs reads the jobs of that run and no other", (t) => {
  const dir = scratch(t);
  const r = make(
    dir,
    "run-jobs",
    { RUN: "42" },
    {
      routes: [
        {
          key: RUN_JOBS,
          stdout: JSON.stringify({ total_count: 1, jobs: [job("ci", "completed", "success")] }),
        },
      ],
    },
  );
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /^RUN 42: 1 jobs$/m);
  assert.ok(
    r.calls.some((c) => c.args.includes(RUN_JOBS)),
    "the jobs endpoint of run 42",
  );
});

test("US-DEV-13 issue 1716 make test-files passes each file as one argument to vitest in its package", (t) => {
  const dir = scratch(t);
  const core = "app/packages/core/src/account/account.test.ts";
  const r = make(dir, "test-files", { FILES: core });
  assert.equal(r.code, 0, r.err);
  const run = r.calls.find((c) => c.cmd === "npx");
  assert.deepEqual(run.args, ["--no-install", "vitest", "run", join(ROOT, core)]);
});

test("US-DEV-13 issue 1716 make refuses a value with a command, a backtick, a space or a semicolon before any call, for each of the five targets", (t) => {
  const dir = scratch(t);
  const marker = join(dir, "touched-by-value");
  const cases = [
    ["run-jobs", "RUN", `42;touch ${marker}`],
    ["conflicts", "PR", `5$(touch ${marker})`],
    ["board-item", "ISSUE", `7\`touch ${marker}\``],
    ["test-files", "FILES", `app/packages/core/src/account/account.test.ts;touch ${marker}`],
    ["format-check", "FILES", `docs/guides/reference/app.md $(touch ${marker})`],
  ];
  for (const [target, name, value] of cases) {
    const r = make(dir, target, { [name]: value });
    assert.equal(r.code, 2, `${target}: ${r.err}`);
    assert.deepEqual(r.calls, [], `${target}: no call at all`);
  }
  assert.equal(existsSync(marker), false, "a value was run as a shell command");
});

test("US-DEV-13 issue 1716 make -n shows each of the five recipes as one node call that carries no user value", () => {
  for (const [target, name] of [
    ["run-jobs", "RUN"],
    ["conflicts", "PR"],
    ["test-files", "FILES"],
    ["format-check", "FILES"],
    ["board-item", "ISSUE"],
  ]) {
    const marker = `touch-${target}-marker`;
    const res = spawnSync("make", ["-n", target, `${name}=1;${marker}`], {
      encoding: "utf8",
      cwd: ROOT,
    });
    assert.equal(res.status, 0, res.stderr);
    const recipe = res.stdout.split("\n").find((l) => l.startsWith("node "));
    assert.ok(recipe?.endsWith(`read-only-cli.mjs ${target}`), `${target} recipe: ${recipe}`);
    assert.ok(!res.stdout.includes(marker), `${target} prints the value`);
  }
});

test("US-DEV-13 issue 1716 make help lists the five targets with US-DEV-13 and issue 1716", () => {
  const res = spawnSync("make", ["-s", "help"], { encoding: "utf8", cwd: ROOT });
  assert.equal(res.status, 0, res.stderr);
  for (const target of ["run-jobs", "conflicts", "test-files", "format-check", "board-item"]) {
    const line = res.stdout.split("\n").find((l) => l.trimStart().startsWith(`${target} `));
    assert.ok(line, `${target} is not in make help`);
    assert.match(line, /US-DEV-13/, target);
    assert.match(line, /issue 1716/, target);
  }
});

test("US-DEV-13 issue 1716 the five targets are in .PHONY, run only the CLI, and the Makefile passes their values raw", () => {
  const makefile = readFileSync(join(ROOT, "Makefile"), "utf8");
  const lines = makefile.split("\n");
  const phony = lines.find((l) => l.startsWith(".PHONY:")).split(/\s+/);
  for (const target of ["run-jobs", "conflicts", "test-files", "format-check", "board-item"]) {
    assert.ok(phony.includes(target), `${target} is not in .PHONY`);
    const at = lines.findIndex((l) => l.startsWith(`${target}:`));
    assert.ok(at >= 0, `${target} has no target line`);
    assert.match(lines[at], /## .*US-DEV-13.*issue 1716/, `${target} help text`);
    assert.equal(
      lines[at + 1],
      `\tnode $(APP)/tools/dev/agent/read-only/read-only-cli.mjs ${target}`,
      `${target} recipe`,
    );
  }
  assert.ok(lines.includes("export REST_RUN := $(value RUN)"), "RUN is not exported raw");
  assert.ok(lines.includes("export RAW_FILES := $(value FILES)"), "FILES is not exported raw");
  assert.match(
    lines.find((l) => l.startsWith("unexport ")),
    /\bRUN\b/,
    "RUN is not unexported",
  );
});

test("US-DEV-13 issue 1716 .claude/settings.json allows exactly the five forms of the read-only targets, once each", () => {
  const settings = JSON.parse(readFileSync(join(ROOT, ".claude", "settings.json"), "utf8"));
  const allow = settings.permissions.allow;
  const five = [
    "Bash(make run-jobs RUN=*)",
    "Bash(make conflicts PR=*)",
    "Bash(make test-files FILES=*)",
    "Bash(make format-check FILES=*)",
    "Bash(make board-item ISSUE=*)",
  ];
  for (const rule of five) {
    assert.equal(allow.filter((r) => r === rule).length, 1, `${rule} is not allowed exactly once`);
  }
  const ours = allow.filter((r) =>
    /^Bash\(make (run-jobs|conflicts|test-files|format-check|board-item)\b/.test(r),
  );
  assert.deepEqual(ours.sort(), [...five].sort(), "no other rule for these targets");
});
