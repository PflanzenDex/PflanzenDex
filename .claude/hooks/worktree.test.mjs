// Tests for the hook's view of git worktrees (US-QG-07, FR-QG-17): a file in a worktree of this repository is judged by
// that worktree's gate files, baselines and migrations, whichever folder the session started in. Real git, temporary
// repositories under os.tmpdir(), each removed when its test ends (#1278).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIRMATIONS_FILE, PLAN_FILE } from "./gate-confirmations.mjs";
import { LOG_FILE } from "./gate-log.mjs";

const HOOK = fileURLToPath(new URL("./run.mjs", import.meta.url));
const PLAN_CLI = fileURLToPath(new URL("./gate-plan.mjs", import.meta.url));
const ALLOW_CLI = fileURLToPath(new URL("./gate-allow.mjs", import.meta.url));
const CONFIRMATIONS_MODULE = fileURLToPath(new URL("./gate-confirmations.mjs", import.meta.url));
const LOG_CLI = fileURLToPath(new URL("./gate-log.mjs", import.meta.url));
// Git variables of an outer git process (a hook of this repo runs `make gates`) must not point the temporary
// repositories at this one.
const ENV = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")),
);

function git(cwd, args) {
  execFileSync(
    "git",
    [
      "-c",
      "user.name=test",
      "-c",
      "user.email=test@example.invalid",
      "-c",
      "commit.gpgsign=false",
      ...args,
    ],
    {
      cwd,
      env: ENV,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
}

/** A temporary repository with one commit; removed when the test ends, also when an assertion fails (#1297). */
function makeRepo(t, name) {
  const dir = mkdtempSync(join(tmpdir(), `${name}-`));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  git(dir, ["init", "-q", "-b", "main"]);
  git(dir, ["commit", "-q", "--allow-empty", "-m", "init"]);
  return dir;
}

/** The main checkout and one worktree under .worktrees/x, as agents work (AGENTS.md, rule 5). origin/dev is the base of the
 * branch, so a gate file that differs from it is a change of the branch (issue 2554). */
function checkout(t) {
  const main = makeRepo(t, "hook-main");
  git(main, ["update-ref", "refs/remotes/origin/dev", "HEAD"]);
  const wt = join(main, ".worktrees", "x");
  git(main, ["worktree", "add", "-q", "-b", "fix/x", wt]);
  // The stored state of the gate files starts here (round 3): the first Bash call refuses once, and the next one is judged.
  runHook("guard-bash", main, { command: "true" });
  runHook("guard-bash", main, { command: "true" });
  return { main, wt };
}

/**
 * The hook's output for one tool call of a session whose project is `session` and whose shell is in `cwd` (the
 * session folder by default): hookSpecificOutput, or null when the hook is silent. `extra` adds the request fields of
 * the hook input (permission_mode, agent_id, transcript_path). The hook swallows its own errors (exit 0, message on
 * stderr), so a line on stderr fails the test.
 */
function runHook(event, session, toolInput, cwd = session, extra = {}) {
  const result = spawnSync("node", [HOOK, event], {
    input: JSON.stringify({
      tool_name: event === "guard-bash" ? "Bash" : "Edit",
      cwd,
      tool_input: toolInput,
      // A main session names its transcript; without one the caller is unknown, and an edit is asked (round 3).
      transcript_path: "/x/projects/p/main.jsonl",
      ...extra,
    }),
    env: { ...ENV, CLAUDE_PROJECT_DIR: session },
    encoding: "utf8",
  });
  assert.equal(result.stderr, "", `the hook reports an error for ${JSON.stringify(toolInput)}`);
  assert.equal(result.status, 0);
  return result.stdout === "" ? null : JSON.parse(result.stdout).hookSpecificOutput;
}
const guard = (session, toolInput, extra) =>
  runHook("guard-edit", session, toolInput, session, extra);
const bash = (session, command, cwd = session) => runHook("guard-bash", session, { command }, cwd);

/** The hook asks a human, and its reason matches. */
function assertAsks(output, reason) {
  assert.equal(output?.permissionDecision, "ask", JSON.stringify(output));
  assert.match(output.permissionDecisionReason, reason);
}

/** The hook denies an edit of an applied migration. */
function assertDenies(output) {
  assert.equal(output?.permissionDecision, "deny", JSON.stringify(output));
  assert.match(output.permissionDecisionReason, /^Applied migrations are immutable/);
}

/** A migration file written in the repository at `dir`; it is not added to git. */
function writeMigration(dir, name) {
  const folder = join(dir, "app/packages/db/migrations");
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, name), "select 1;\n");
  return join(folder, name);
}

// A ui-text baseline with one entry; the edits below change only its count.
const baselineText = (count) =>
  `{\n  "maxTotal": ${count},\n  "entries": [{ "file": "app/packages/web/src/a.tsx", "count": ${count} }]\n}\n`;

test("US-QG-07, FR-QG-17: a session in the main checkout asks before an edit of a gate file in a worktree", (t) => {
  const { main, wt } = checkout(t);
  assertAsks(guard(main, { file_path: join(wt, "Makefile") }), /^Makefile defines a gate/);
});

test("US-QG-07, US-DEV-07: a session in the main checkout denies an edit of a committed migration in a worktree", (t) => {
  const { main, wt } = checkout(t);
  const file_path = writeMigration(wt, "0001_fixture.sql");
  git(wt, ["add", "--", "app/packages/db/migrations/0001_fixture.sql"]);
  git(wt, ["commit", "-q", "-m", "fixture"]);
  assertDenies(guard(main, { file_path }));
});

test("US-QG-07, US-DEV-07: an untracked new migration in a worktree is not denied", (t) => {
  const { wt } = checkout(t);
  assert.equal(guard(wt, { file_path: writeMigration(wt, "0002_new.sql") }), null);
  // A migration that is not on disk yet is created by the edit itself, as before.
  assert.equal(
    guard(wt, { file_path: join(wt, "app/packages/db/migrations/0003_missing.sql") }),
    null,
  );
});

test("US-QG-07, US-DEV-07: an untracked new migration in the main checkout is not denied", (t) => {
  const { main } = checkout(t);
  assert.equal(guard(main, { file_path: writeMigration(main, "0002_new.sql") }), null);
});

test("US-QG-07, US-DEV-07: a new migration that is staged but in no commit is not denied", (t) => {
  const { wt } = checkout(t);
  const file_path = writeMigration(wt, "0002_new.sql");
  git(wt, ["add", "--", "app/packages/db/migrations/0002_new.sql"]);
  assert.equal(guard(wt, { file_path }), null);
});

test("US-QG-07, US-DEV-07: a committed migration in the main checkout is denied", (t) => {
  const { main } = checkout(t);
  const file_path = writeMigration(main, "0001_fixture.sql");
  git(main, ["add", "--", "app/packages/db/migrations/0001_fixture.sql"]);
  git(main, ["commit", "-q", "-m", "fixture"]);
  assertDenies(guard(main, { file_path }));
});

test("US-QG-07, US-DEV-07: a migration that git cannot judge is denied (fail closed)", (t) => {
  // Not a repository: the session root is the folder itself, so the migration path matches with no repository behind it.
  const outside = mkdtempSync(join(tmpdir(), "hook-outside-migration-"));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  assertDenies(guard(outside, { file_path: writeMigration(outside, "0001_fixture.sql") }));
  // A repository without a commit: HEAD does not exist, so git cannot say what it holds.
  const unborn = mkdtempSync(join(tmpdir(), "hook-unborn-migration-"));
  t.after(() => rmSync(unborn, { recursive: true, force: true }));
  git(unborn, ["init", "-q", "-b", "main"]);
  assertDenies(guard(unborn, { file_path: writeMigration(unborn, "0001_fixture.sql") }));
});

test("US-QG-07, FR-QG-17: a baseline in a worktree is judged by its own text, not by the copy in the main checkout", (t) => {
  const { main, wt } = checkout(t);
  const rel = "app/config/gates/baselines/ui-text-baseline.json";
  // The copies differ (count 3 in the main checkout, 6 in the worktree), so each answer shows which copy was read.
  for (const [dir, count] of [
    [main, 3],
    [wt, 6],
  ]) {
    mkdirSync(join(dir, "app/config/gates/baselines"), { recursive: true });
    writeFileSync(join(dir, rel), baselineText(count));
  }
  const file_path = join(wt, rel);
  assertAsks(
    guard(main, { file_path, old_string: '"count": 6', new_string: '"count": 7' }),
    /a\.tsx: count rose from 6 to 7/,
  );
  assert.equal(
    guard(main, { file_path, old_string: '"count": 6', new_string: '"count": 5' }),
    null,
  );
});

test("US-QG-07, FR-QG-17: a new gate file in a folder the worktree does not have yet asks", (t) => {
  const { main, wt } = checkout(t);
  assert.equal(existsSync(join(wt, "app")), false);
  assertAsks(
    guard(main, {
      file_path: join(wt, "app/tools/check/quality/new-check/limits.mjs"),
      content: "export {};\n",
    }),
    /^app\/tools\/check\/quality\/new-check\/limits\.mjs defines a gate/,
  );
});

test("US-QG-07, FR-QG-17: a file in an unrelated repository or outside any repository gives nothing", (t) => {
  const { main } = checkout(t);
  const other = makeRepo(t, "hook-other");
  const outside = mkdtempSync(join(tmpdir(), "hook-outside-"));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  for (const dir of [other, outside]) {
    writeFileSync(join(dir, "Makefile"), "all:\n");
    assert.equal(guard(main, { file_path: join(dir, "Makefile") }), null, dir);
  }
});

test("US-QG-07, FR-QG-17: an ordinary code file in a worktree gives nothing", (t) => {
  const { main, wt } = checkout(t);
  const dir = join(wt, "app/packages/core/src");
  mkdirSync(dir, { recursive: true });
  const file_path = join(dir, "index.ts");
  writeFileSync(file_path, "export {};\n");
  assert.equal(guard(main, { file_path }), null);
});

test("US-QG-07, FR-QG-17: a session rooted in the worktree itself still asks before an edit of a gate file", (t) => {
  const { wt } = checkout(t);
  assertAsks(guard(wt, { file_path: join(wt, "Makefile") }), /^Makefile defines a gate/);
});

test("US-QG-07, FR-QG-17: a spec edited in a worktree runs the spec check in that worktree", (t) => {
  const { main, wt } = checkout(t);
  // A stub stands in for the check and reports the folder it runs in, so the answer shows where it ran.
  mkdirSync(join(wt, "app/tools/check/docs/specs"), { recursive: true });
  writeFileSync(
    join(wt, "app/tools/check/docs/specs/check-specs.mjs"),
    "console.error(`checked in ${process.cwd()}`);\nprocess.exit(1);\n",
  );
  mkdirSync(join(wt, "docs/specs/product"), { recursive: true });
  const file_path = join(wt, "docs/specs/product/00-test.md");
  writeFileSync(file_path, "# test\n");
  const output = runHook("after-edit", main, { file_path });
  assert.match(
    output?.additionalContext ?? "",
    /^Spec check failed after editing docs\/specs\/product\/00-test\.md/,
  );
  assert.match(output.additionalContext, /checked in .*\.worktrees[/\\]x/);
});

// The Bash guard reads git's view of the repository the hook runs in. These commands are only judged, never run.
test("US-QG-07: a reset --hard typed in the main checkout is refused with the reason; in a worktree it stays a question", (t) => {
  const { main, wt } = checkout(t);
  const inMain = bash(main, "git reset --hard");
  assert.equal(inMain?.permissionDecision, "deny");
  assert.match(inMain.permissionDecisionReason, /would act on the main checkout/);
  assert.equal(bash(wt, "git reset --hard")?.permissionDecision, "ask");
  assert.equal(bash(wt, "git clean -fd")?.permissionDecision, "ask");
});

test("US-QG-07: git -C or a cd that names the main checkout is refused from a worktree; a cd into a worktree is not", (t) => {
  const { main, wt } = checkout(t);
  assert.equal(bash(wt, `git -C ${main} clean -fd`)?.permissionDecision, "deny");
  assert.equal(bash(wt, `cd ${main} && git reset --hard`)?.permissionDecision, "deny");
  assert.equal(bash(main, `cd ${wt} && git reset --hard`)?.permissionDecision, "ask");
  // The worktree is allowed. The existing question (discardsWork) does not read `-C`, so it may stay silent here.
  assert.notEqual(bash(main, `git -C ${wt} clean -fd`)?.permissionDecision, "deny");
});

test("US-QG-07: a failed cd does not move the shell out of the main checkout", (t) => {
  const { main } = checkout(t);
  assert.equal(
    bash(main, `cd ${join(main, "missing")} ; git clean -fd`)?.permissionDecision,
    "deny",
  );
});

test("US-QG-07: a repository other than the hook's is judged by its own folder, not as the main checkout", (t) => {
  const { main } = checkout(t);
  const other = makeRepo(t, "hook-other");
  // The project is `main`; the shell is in `other`. A reset there is an ordinary question, as before this guard.
  // The other repository has no stored state yet: two calls store it (round 3), then the reset is a plain question.
  bash(main, "true", other);
  bash(main, "true", other);
  assert.equal(bash(main, "git reset --hard", other)?.permissionDecision, "ask");
});

// The gate file records of one worktree (US-QG-07): the record lives in the worktree's git directory, keyed by branch.
const gitDirOf = (dir) =>
  execFileSync("git", ["rev-parse", "--absolute-git-dir"], {
    cwd: dir,
    env: ENV,
    encoding: "utf8",
  }).trim();
const recordOf = (dir) => join(gitDirOf(dir), CONFIRMATIONS_FILE);
const planOf = (dir) => join(gitDirOf(dir), PLAN_FILE);
/** The text of a name as a regular expression, so a record name is matched as written. */
const literal = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** The PostToolUse event of an edit that went through: after-edit logs it, and the one-time answer covers that edit only. */
const applied = (session, toolInput) => runHook("after-edit", session, toolInput);
const BRANCH = "refs/heads/fix/x";

// The owner's branch-wide answer. The command line refuses to run outside the owner's terminal (issue 2554, round 2), so the tests
// call allowGate in a child process, with the branch and the file checks of the command line.
// A pseudo-terminal for the command line: python's pty.fork gives the command a terminal on stdin, stdout and stderr, and returns the
// command's output and exit status. The tests have no terminal of their own, so this is the only way to reach the command's checks.
const PTY_RUN = [
  "import os, pty, sys",
  "pid, fd = pty.fork()",
  "if pid == 0:",
  "    os.execvp(sys.argv[1], sys.argv[1:])",
  "out = b''",
  "while True:",
  "    try:",
  "        data = os.read(fd, 65536)",
  "    except OSError:",
  "        break",
  "    if not data:",
  "        break",
  "    out += data",
  "_, status = os.waitpid(pid, 0)",
  "sys.stdout.buffer.write(out)",
  "sys.exit(os.waitstatus_to_exitcode(status))",
].join("\n");
// The owner's branch-wide answer: the command line runs in a pseudo-terminal, as the owner's own shell gives it, with CLAUDECODE
// removed (round 3, d-146). `script` gives any command a pseudo-terminal: that is a known limit of the terminal check, and the tests
// use it to reach the command line's own checks. Its output (stdout and stderr) comes back on stdout.
const allow = (dir, files) => {
  const env = Object.fromEntries(Object.entries(ENV).filter(([name]) => name !== "CLAUDECODE"));
  return spawnSync("python3", ["-c", PTY_RUN, "node", ALLOW_CLI], {
    cwd: dir,
    env: { ...env, GATE_PLAN_FILES: files },
    encoding: "utf8",
  });
};
/** `make gate-plan` runs gate-plan.mjs in the worktree with the files in GATE_PLAN_FILES, as the Makefile passes them. */
const plan = (dir, files) =>
  spawnSync("node", [PLAN_CLI], {
    cwd: dir,
    env: { ...ENV, GATE_PLAN_FILES: files },
    encoding: "utf8",
  });
const commonOf = (dir) =>
  execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
    cwd: dir,
    env: ENV,
    encoding: "utf8",
  }).trim();
/** The decision log, shared by the worktrees of the repository (issue 2554): one parsed object per line. */
const logLines = (dir) => {
  const file = join(commonOf(dir), LOG_FILE);
  return existsSync(file)
    ? readFileSync(file, "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line))
    : [];
};

/** Two gate files of the worktree, committed on the branch and in origin/dev: a plan sees no change in them (issue 2554). */
function gateFiles(wt) {
  mkdirSync(join(wt, ".githooks"), { recursive: true });
  mkdirSync(join(wt, ".github"), { recursive: true });
  const files = {
    makefile: join(wt, "Makefile"),
    pre: join(wt, ".githooks/pre-commit"),
    owners: join(wt, ".github/CODEOWNERS"),
  };
  for (const file of Object.values(files)) writeFileSync(file, "x\n");
  git(wt, ["add", "--", "Makefile", ".githooks", ".github"]);
  git(wt, ["commit", "-q", "-m", "gate files"]);
  git(wt, ["update-ref", "refs/remotes/origin/dev", "HEAD"]);
  // The files are committed after the stored state: store their state again (round 3).
  runHook("guard-bash", wt, { command: "true" });
  runHook("guard-bash", wt, { command: "true" });
  return files;
}

test("US-QG-07, issue 2554: a gate file asks at every edit: an edit that went through confirms nothing for the next one", (t) => {
  const { wt } = checkout(t);
  const makefile = join(wt, "Makefile");
  const pre = join(wt, ".githooks/pre-commit");
  const first = guard(wt, { file_path: makefile });
  assertAsks(first, /^Makefile defines a gate/);
  assert.doesNotMatch(first.permissionDecisionReason, /later edits|plan/);
  writeFileSync(makefile, "all:\n");
  assert.equal(applied(wt, { file_path: makefile }), null);
  assertAsks(guard(wt, { file_path: makefile }), /^Makefile defines a gate/);
  assertAsks(guard(wt, { file_path: pre }), /^\.githooks\/pre-commit defines a gate/);
  // Another branch asks too: no edit of this branch confirms a file for it.
  git(wt, ["switch", "-q", "-c", "fix/y"]);
  assertAsks(guard(wt, { file_path: makefile }), /^Makefile defines a gate/);
  git(wt, ["switch", "-q", "fix/x"]);
  assertAsks(guard(wt, { file_path: makefile }), /^Makefile defines a gate/);
});

test("US-QG-07, issue 2554: the owner's allow confirms a gate file for its branch: later edits pass, another file and another branch ask", (t) => {
  const { main, wt } = checkout(t);
  const { makefile, pre } = gateFiles(wt);
  assert.equal(allow(wt, "Makefile").status, 0);
  assert.equal(guard(wt, { file_path: makefile }), null);
  // The folder the session started in does not matter: the file's own worktree and branch decide.
  assert.equal(guard(main, { file_path: makefile }), null);
  assertAsks(guard(wt, { file_path: pre }), /^\.githooks\/pre-commit defines a gate/);
  // A new branch asks again; the allow of fix/x stays for fix/x.
  git(wt, ["switch", "-q", "-c", "fix/y"]);
  assertAsks(guard(wt, { file_path: makefile }), /^Makefile defines a gate/);
  git(wt, ["switch", "-q", "fix/x"]);
  assert.equal(guard(wt, { file_path: makefile }), null);
});

test("US-QG-07, issue 2554: a gate file asks in another worktree and on a detached HEAD; an edit there records nothing", (t) => {
  const { main, wt } = checkout(t);
  const makefile = join(wt, "Makefile");
  const pre = join(wt, ".githooks/pre-commit");
  writeFileSync(makefile, "all:\n");
  assert.equal(allow(wt, "Makefile").status, 0);
  assert.equal(guard(wt, { file_path: makefile }), null);
  // Another worktree has its own branch, which holds no allow for this file.
  const other = join(main, ".worktrees", "y");
  git(main, ["worktree", "add", "-q", "--detach", other]);
  assertAsks(guard(other, { file_path: join(other, "Makefile") }), /^Makefile defines a gate/);
  // A detached HEAD has no branch to key an allow by: it always asks, and an allow there is refused.
  git(wt, ["checkout", "-q", "--detach"]);
  assertAsks(guard(wt, { file_path: makefile }), /^Makefile defines a gate/);
  assert.equal(allow(wt, "Makefile").status, 1);
  applied(wt, { file_path: pre });
  assertAsks(guard(wt, { file_path: pre }), /^\.githooks\/pre-commit defines a gate/);
  git(wt, ["switch", "-q", "fix/x"]);
  assertAsks(guard(wt, { file_path: pre }), /^\.githooks\/pre-commit defines a gate/);
  assert.equal(guard(wt, { file_path: makefile }), null);
});

test("US-QG-07, issue 2554: a confirmation record that is missing, unreadable or malformed asks, and an edit of the record itself asks", (t) => {
  const { wt } = checkout(t);
  const makefile = join(wt, "Makefile");
  const record = recordOf(wt);
  // An ordinary file records nothing.
  writeFileSync(join(wt, "notes.txt"), "x\n");
  applied(wt, { file_path: join(wt, "notes.txt") });
  assert.equal(existsSync(record), false);
  assert.equal(allow(wt, "Makefile").status, 0);
  assert.equal(guard(wt, { file_path: makefile }), null);
  // Missing: the record is gone.
  rmSync(record);
  assertAsks(guard(wt, { file_path: makefile }), /^Makefile defines a gate/);
  // Malformed.
  writeFileSync(record, "{ not json");
  assertAsks(guard(wt, { file_path: makefile }), /^Makefile defines a gate/);
  // Unreadable: a folder stands where the record should be.
  rmSync(record);
  mkdirSync(record);
  assertAsks(guard(wt, { file_path: makefile }), /^Makefile defines a gate/);
  // The record is written by make gate-allow only: an edit of it is refused, whatever it holds (issue 2554, round 2).
  rmSync(record, { recursive: true });
  const refusedEdit = guard(wt, { file_path: record });
  assert.equal(refusedEdit?.permissionDecision, "deny");
  assert.match(
    refusedEdit.permissionDecisionReason,
    new RegExp(`^${literal(CONFIRMATIONS_FILE)} records which gate files`),
  );
});

test("US-QG-07, issue 2554: a plan names no other file in a question: each gate file asks alone, and an edit confirms nothing for the rest", (t) => {
  const { wt } = checkout(t);
  const { makefile, pre } = gateFiles(wt);
  assert.equal(plan(wt, ".githooks/pre-commit Makefile").status, 0);
  const asked = guard(wt, { file_path: makefile });
  assertAsks(asked, /^Makefile defines a gate/);
  assert.doesNotMatch(asked.permissionDecisionReason, /\.githooks|plan/);
  writeFileSync(makefile, "all:\nclean:\n");
  applied(wt, { file_path: makefile });
  assertAsks(guard(wt, { file_path: makefile }), /^Makefile defines a gate/);
  assertAsks(guard(wt, { file_path: pre }), /^\.githooks\/pre-commit defines a gate/);
});

test("US-QG-07, issue 2554: a plan that cannot be read asks each gate file alone, and a plan naming a non-gate path is unusable", (t) => {
  const { wt } = checkout(t);
  const { makefile, pre } = gateFiles(wt);
  writeFileSync(planOf(wt), "{ not json");
  assertAsks(guard(wt, { file_path: makefile }), /^Makefile defines a gate/);
  writeFileSync(makefile, "all:\nclean:\n");
  applied(wt, { file_path: makefile });
  assertAsks(guard(wt, { file_path: makefile }), /^Makefile defines a gate/);
  assertAsks(guard(wt, { file_path: pre }), /^\.githooks\/pre-commit defines a gate/);
  writeFileSync(planOf(wt), JSON.stringify({ [BRANCH]: ["Makefile", "README.md"] }));
  assertAsks(guard(wt, { file_path: pre }), /^\.githooks\/pre-commit defines a gate/);
});

test("US-QG-07: make gate-plan confirms nothing: every planned file still asks, and the record stays missing", (t) => {
  const { wt } = checkout(t);
  const { makefile, pre } = gateFiles(wt);
  assert.equal(plan(wt, ".githooks/pre-commit Makefile").status, 0);
  assertAsks(guard(wt, { file_path: makefile }), /^Makefile defines a gate/);
  assertAsks(guard(wt, { file_path: pre }), /^\.githooks\/pre-commit defines a gate/);
  assert.equal(existsSync(recordOf(wt)), false);
});

test("US-QG-07: make gate-plan refuses a path that is not a gate file, an empty list and a detached HEAD, and writes nothing", (t) => {
  const { wt } = checkout(t);
  gateFiles(wt);
  const refused = plan(wt, "README.md Makefile");
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /^gate-plan: not a gate file: README\.md\n/);
  assert.notEqual(plan(wt, "").status, 0);
  assert.notEqual(plan(wt, "../Makefile").status, 0);
  assert.equal(existsSync(planOf(wt)), false);
  // A leading ./ is the same file: it is recorded without it.
  assert.equal(plan(wt, "./Makefile").status, 0);
  assert.deepEqual(JSON.parse(readFileSync(planOf(wt), "utf8")), { [BRANCH]: ["Makefile"] });
  git(wt, ["checkout", "-q", "--detach"]);
  const detached = plan(wt, "Makefile");
  assert.notEqual(detached.status, 0);
  assert.match(detached.stderr, /HEAD is detached/);
});

test("US-QG-07, issue 2554, round 2: make gate-plan warns about a listed gate file that already differs from origin/dev and no owner allowed; the plan is still written, and the warning is logged", (t) => {
  const { wt } = checkout(t);
  const { makefile } = gateFiles(wt);
  writeFileSync(makefile, "all:\nclean:\n");
  const warned = plan(wt, "Makefile .githooks/pre-commit");
  assert.equal(warned.status, 0, warned.stderr);
  assert.equal(
    warned.stderr,
    "gate-plan: warning: Makefile already differ from origin/dev, and no owner allowed them. The plan grants nothing; the edit guard still asks the owner at each edit (issue 2554).\n",
  );
  assert.deepEqual(JSON.parse(readFileSync(planOf(wt), "utf8")), {
    [BRANCH]: [".githooks/pre-commit", "Makefile"],
  });
  assert.ok(
    logLines(wt).some(
      (line) =>
        line.decision === "warned" &&
        line.source === "gate-plan" &&
        line.file === "Makefile" &&
        line.branch === "fix/x",
    ),
  );
  // Once the owner allows the file, the same plan is silent.
  assert.equal(allow(wt, "Makefile").status, 0);
  assert.equal(plan(wt, "Makefile .githooks/pre-commit").stderr, "");
});

test("US-QG-07, issue 2554, round 2: make gate-plan warns about a new untracked gate file and about a missing origin/dev, and stays silent for a changed gate test", (t) => {
  const { wt } = checkout(t);
  gateFiles(wt);
  writeFileSync(join(wt, ".githooks/new-hook"), "x\n");
  const untracked = plan(wt, ".githooks/new-hook");
  assert.equal(untracked.status, 0);
  assert.match(untracked.stderr, /warning: \.githooks\/new-hook already differ from origin\/dev/);
  mkdirSync(join(wt, ".claude/hooks"), { recursive: true });
  writeFileSync(join(wt, ".claude/hooks/rules.test.mjs"), "// changed\n");
  const testOnly = plan(wt, ".claude/hooks/rules.test.mjs");
  assert.equal(testOnly.status, 0);
  assert.equal(testOnly.stderr, "");
  // A repository whose origin/dev is missing cannot show that a file is unchanged: a warning, never a silent pass.
  const bare = makeRepo(t, "hook-no-dev");
  const bareWt = join(bare, ".worktrees", "z");
  git(bare, ["worktree", "add", "-q", "-b", "fix/z", bareWt]);
  writeFileSync(join(bareWt, "Makefile"), "x\n");
  const unknown = plan(bareWt, "Makefile");
  assert.equal(unknown.status, 0);
  assert.match(unknown.stderr, /warning: Makefile already differ from origin\/dev/);
});

test("US-QG-07, issue 2554, round 2: make gate-allow refuses to run outside the owner's terminal: in an agent session or without a terminal", (t) => {
  const { wt } = checkout(t);
  gateFiles(wt);
  const cli = spawnSync("node", [ALLOW_CLI], {
    cwd: wt,
    env: { ...ENV, GATE_PLAN_FILES: "Makefile" },
    encoding: "utf8",
  });
  assert.equal(cli.status, 1);
  assert.match(cli.stderr, /^gate-allow: runs only in the owner's own terminal/);
  assert.equal(existsSync(recordOf(wt)), false);
});

test("US-QG-07, issue 2554: make gate-allow refuses a file that asks no question, a path outside the gate files, and a detached HEAD", (t) => {
  const { wt } = checkout(t);
  gateFiles(wt);
  // The pseudo-terminal returns the command's stderr on stdout, so both are read.
  const output = (r) => `${r.stdout}${r.stderr}`;
  const testFile = allow(wt, ".claude/hooks/rules.test.mjs");
  assert.equal(testFile.status, 1);
  assert.match(
    output(testFile),
    /gate-allow: not a gate file that asks: \.claude\/hooks\/rules\.test\.mjs/,
  );
  assert.equal(allow(wt, "README.md Makefile").status, 1);
  assert.equal(allow(wt, "").status, 1);
  assert.equal(existsSync(recordOf(wt)), false);
  git(wt, ["checkout", "-q", "--detach"]);
  const detached = allow(wt, "Makefile");
  assert.equal(detached.status, 1);
  assert.match(output(detached), /HEAD is detached/);
});

test("US-QG-07, issue 2554: the owner's allow is logged, and an edit of a gate file by a subagent is denied even when the branch allows it", (t) => {
  const { wt } = checkout(t);
  const { makefile } = gateFiles(wt);
  assert.equal(allow(wt, "Makefile").status, 0);
  assert.ok(
    logLines(wt).some((line) => line.decision === "allowed" && line.source === "gate-allow"),
  );
  const denied = guard(
    wt,
    { file_path: makefile },
    { agent_id: "a1b2", agent_type: "implementer" },
  );
  assert.equal(denied?.permissionDecision, "deny");
  assert.match(denied.permissionDecisionReason, /^Subagents do not edit gate files\./);
  const byTranscript = guard(
    wt,
    { file_path: makefile },
    { transcript_path: join(wt, "projects/p/subagents/agent-1.jsonl") },
  );
  assert.equal(byTranscript?.permissionDecision, "deny");
  assert.equal(guard(wt, { file_path: makefile })?.permissionDecision ?? null, null);
});

test("US-QG-07, issue 2554: a subagent is denied an unconfirmed gate file too, while a gate test passes for it", (t) => {
  const { wt } = checkout(t);
  const { makefile } = gateFiles(wt);
  assert.equal(guard(wt, { file_path: makefile }, { agent_id: "a1" })?.permissionDecision, "deny");
  mkdirSync(join(wt, ".claude/hooks"), { recursive: true });
  assert.equal(
    guard(wt, { file_path: join(wt, ".claude/hooks/rules.test.mjs") }, { agent_id: "a1" }),
    null,
  );
});

test("US-QG-07, issue 2554: in an automatic permission mode a gate file edit asks, also an allowed file, and the default mode passes an allowed file", (t) => {
  const { wt } = checkout(t);
  const { makefile } = gateFiles(wt);
  for (const mode of ["auto", "bypassPermissions", "dontAsk"]) {
    const output = guard(wt, { file_path: makefile }, { permission_mode: mode });
    assertAsks(output, /^Makefile defines a gate/);
  }
  assertAsks(
    guard(wt, { file_path: makefile }, { permission_mode: "default" }),
    /^Makefile defines a gate/,
  );
  // An allowed file asks in an automatic mode too (d-145).
  assert.equal(allow(wt, "Makefile").status, 0);
  assertAsks(
    guard(wt, { file_path: makefile }, { permission_mode: "auto" }),
    /^Makefile defines a gate/,
  );
  assert.equal(guard(wt, { file_path: makefile }, { permission_mode: "default" }), null);
});

test("US-QG-07, issue 2554: a Bash write to a gate file is denied in the main checkout and in a worktree, and the decision is logged", (t) => {
  const { main, wt } = checkout(t);
  gateFiles(wt);
  const written = bash(wt, "sed -i 's/a/b/' Makefile");
  assert.equal(written?.permissionDecision, "deny");
  assert.match(written.permissionDecisionReason, /^This command writes a gate file \(Makefile\)\./);
  assert.equal(bash(main, `cp /tmp/x ${join(wt, "Makefile")}`)?.permissionDecision, "deny");
  assert.equal(bash(wt, "cat Makefile"), null);
  assert.equal(bash(wt, 'echo x > "$F"')?.permissionDecision, "ask");
  assert.ok(
    logLines(wt).some(
      (line) =>
        line.decision === "deny" &&
        line.source === "guard-bash" &&
        line.file === "Makefile" &&
        line.branch === "fix/x" &&
        line.actor === "main",
    ),
  );
});

test("US-QG-07, issue 2554: an agent cannot run make gate-allow, and the refusal says that only the owner runs it", (t) => {
  const { wt } = checkout(t);
  const refused = bash(wt, "make gate-allow FILES=Makefile");
  assert.equal(refused?.permissionDecision, "deny");
  assert.match(refused.permissionDecisionReason, /^Only the owner runs `gate-allow`/);
});

test("US-QG-07, issue 2554: the decision log shows the asks, the applied edits and the refusals of every worktree, and says when it is empty", (t) => {
  const { main, wt } = checkout(t);
  // The fixture's first Bash calls log the refusal of the missing stored state (round 3); no edit is logged yet.
  const start = spawnSync("node", [LOG_CLI], { cwd: main, env: ENV, encoding: "utf8" }).stdout;
  assert.doesNotMatch(start, /guard-edit|after-edit/);
  const makefile = join(wt, "Makefile");
  assertAsks(guard(wt, { file_path: makefile }), /^Makefile defines a gate/);
  writeFileSync(makefile, "all:\n");
  applied(wt, { file_path: makefile });
  const shown = spawnSync("node", [LOG_CLI, "10"], { cwd: main, env: ENV, encoding: "utf8" });
  assert.equal(shown.status, 0, shown.stderr);
  // The requests below carry no permission_mode, so the table shows a dash in the mode column.
  assert.match(shown.stdout, /ask\s+guard-edit\s+main\s+-\s+-\s+fix\/x\s+Makefile/);
  assert.match(shown.stdout, /applied\s+after-edit\s+main\s+-\s+-\s+fix\/x\s+Makefile/);
});

test("US-QG-07, issue 2554: an edit of a gate test asks nothing, is no decision of the log, and records nothing", (t) => {
  const { wt } = checkout(t);
  mkdirSync(join(wt, ".claude/hooks"), { recursive: true });
  const hookTest = join(wt, ".claude/hooks/rules.test.mjs");
  writeFileSync(hookTest, "// test\n");
  // The test is a gate file for make merge: the other test file of the list and the merge tool's test pass the same way.
  assert.equal(guard(wt, { file_path: hookTest }), null);
  assert.equal(guard(wt, { file_path: join(wt, "app/tools/workflow/merge-pr.test.mjs") }), null);
  assertAsks(
    guard(wt, { file_path: join(wt, "app/tools/workflow/merge-pr.mjs") }),
    /^app\/tools\/workflow\/merge-pr\.mjs defines a gate/,
  );
  assert.equal(applied(wt, { file_path: hookTest }), null);
  assert.equal(existsSync(recordOf(wt)), false);
});

test("US-QG-07, issue 2554: a plan that names only a gate test is recorded, prints that no file asks, and every edit of the test passes", (t) => {
  const { wt } = checkout(t);
  mkdirSync(join(wt, ".claude/hooks"), { recursive: true });
  const hookTest = join(wt, ".claude/hooks/gate-plan.test.mjs");
  writeFileSync(hookTest, "// test\n");
  const planned = plan(wt, ".claude/hooks/gate-plan.test.mjs");
  assert.equal(planned.status, 0, planned.stderr);
  assert.doesNotMatch(planned.stdout, /Nothing is confirmed/);
  assert.deepEqual(JSON.parse(readFileSync(planOf(wt), "utf8")), {
    [BRANCH]: [".claude/hooks/gate-plan.test.mjs"],
  });
  assert.equal(guard(wt, { file_path: hookTest }), null);
});

test("US-QG-07: an edit of the plan record is denied, whatever it holds (issue 2554, round 2)", (t) => {
  const { wt } = checkout(t);
  const output = guard(wt, { file_path: planOf(wt) });
  assert.equal(output?.permissionDecision, "deny");
  assert.match(
    output.permissionDecisionReason,
    new RegExp(`^${literal(PLAN_FILE)} lists the gate files`),
  );
});

test("US-QG-07: a gate file outside the plan asks alone, with no list of the plan in its question", (t) => {
  const { wt } = checkout(t);
  const { makefile, pre } = gateFiles(wt);
  assert.equal(plan(wt, "Makefile").status, 0);
  const asked = guard(wt, { file_path: pre });
  assertAsks(asked, /^\.githooks\/pre-commit defines a gate/);
  assert.doesNotMatch(asked.permissionDecisionReason, /Makefile/);
  assertAsks(guard(wt, { file_path: makefile }), /^Makefile defines a gate/);
});

test("US-QG-07: a planned gate test is named by no question, make gate-plan says that it asks none, and its edits record nothing", (t) => {
  const { wt } = checkout(t);
  const { makefile } = gateFiles(wt);
  const hookTest = join(wt, ".claude/hooks/rules.test.mjs");
  mkdirSync(join(wt, ".claude/hooks"), { recursive: true });
  writeFileSync(hookTest, "// test\n");
  // The test is a gate file for make merge: the other test file of the list and the merge tool's test pass the same way.
  assert.equal(guard(wt, { file_path: hookTest }), null);
  assert.equal(guard(wt, { file_path: join(wt, "app/tools/workflow/merge-pr.test.mjs") }), null);
  assertAsks(
    guard(wt, { file_path: join(wt, "app/tools/workflow/merge-pr.mjs") }),
    /^app\/tools\/workflow\/merge-pr\.mjs defines a gate/,
  );
  // make gate-plan accepts the test, says once that it asks no question, and the Makefile's question does not name it.
  const planned = plan(wt, "Makefile .claude/hooks/rules.test.mjs");
  assert.equal(planned.status, 0, planned.stderr);
  assert.equal(planned.stdout.split("Test files ask no question").length - 1, 1);
  assert.match(
    planned.stdout,
    /Test files ask no question in the hook \(\.claude\/hooks\/rules\.test\.mjs\): make merge refuses/,
  );
  const asked = guard(wt, { file_path: makefile });
  assertAsks(asked, /^Makefile defines a gate/);
  assert.doesNotMatch(asked.permissionDecisionReason, /rules\.test\.mjs/);
  // A gate test records nothing: an edit of it is applied and no record appears.
  writeFileSync(hookTest, "// changed\n");
  assert.equal(applied(wt, { file_path: hookTest }), null);
  assert.equal(existsSync(recordOf(wt)), false);
});

test("US-QG-07: the Bash guard refuses a command that names a gate record, and passes make gate-plan and ordinary commands", (t) => {
  const { wt } = checkout(t);
  const written = bash(wt, `echo '{}' > "$(git rev-parse --git-dir)/${CONFIRMATIONS_FILE}"`);
  assert.equal(written?.permissionDecision, "deny");
  assert.match(written.permissionDecisionReason, /claude-gate\* files/);
  assert.equal(
    bash(wt, `cp /tmp/x.json "$(git rev-parse --git-dir)/${PLAN_FILE}"`)?.permissionDecision,
    "deny",
  );
  assert.equal(bash(wt, "make gate-plan FILES=Makefile"), null);
  assert.equal(bash(wt, "git status"), null);
});

test("US-QG-07: a Write, Edit, MultiEdit or NotebookEdit that names a record is denied outside .claude/hooks, and the same text passes inside it", (t) => {
  const { wt } = checkout(t);
  const named = `echo '{}' > "$(git rev-parse --git-dir)/${PLAN_FILE}"\n`;
  const denied = (output) => {
    assert.equal(output?.permissionDecision, "deny", JSON.stringify(output));
    assert.match(output.permissionDecisionReason, /^This text names a claude-gate\* file/);
  };
  // A script written with Write, of any name and type: the command that runs it names no record.
  denied(guard(wt, { file_path: join(wt, "scripts/write-record.sh"), content: named }));
  denied(guard(wt, { file_path: join(wt, "docs/notes.md"), content: named }));
  // Edit, MultiEdit and NotebookEdit carry the new text in new_string, edits[].new_string and new_source.
  mkdirSync(join(wt, "scripts"), { recursive: true });
  writeFileSync(join(wt, "scripts/run.mjs"), "export {};\n");
  denied(
    guard(wt, {
      file_path: join(wt, "scripts/run.mjs"),
      old_string: "export {};",
      new_string: named,
    }),
  );
  denied(
    guard(wt, {
      file_path: join(wt, "scripts/run.mjs"),
      edits: [
        { old_string: "export", new_string: "export" },
        { old_string: "{};", new_string: named },
      ],
    }),
  );
  denied(guard(wt, { notebook_path: join(wt, "notebooks/a.ipynb"), new_source: named }));
  // A dangling symlink inside .claude/hooks to a file outside it: the Write creates that outside file, so it is refused.
  const outside = mkdtempSync(join(tmpdir(), "record-outside-"));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  mkdirSync(join(wt, ".claude/hooks"), { recursive: true });
  symlinkSync(join(outside, "run.sh"), join(wt, ".claude/hooks/link.test.mjs"));
  denied(guard(wt, { file_path: join(wt, ".claude/hooks/link.test.mjs"), content: named }));
  // Inside .claude/hooks the same text passes (a gate test asks nothing), and ordinary text passes everywhere.
  assert.equal(
    guard(wt, { file_path: join(wt, ".claude/hooks/extra.test.mjs"), content: named }),
    null,
  );
  assert.equal(
    guard(wt, { file_path: join(wt, "scripts/ordinary.mjs"), content: "export const x = 1;\n" }),
    null,
  );
  // A doc that names the records in the glob form passes.
  assert.equal(
    guard(wt, {
      file_path: join(wt, "docs/notes.md"),
      content: "The records are `claude-gate*` files.\n",
    }),
    null,
  );
});
