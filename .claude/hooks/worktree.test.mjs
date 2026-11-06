// Tests for the hook's view of git worktrees (US-QG-07, FR-QG-17): a file in a worktree of this repository is judged by
// that worktree's gate files, baselines and migrations, whichever folder the session started in. Real git, temporary
// repositories under os.tmpdir(), each removed when its test ends (#1278).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HOOK = fileURLToPath(new URL("./run.mjs", import.meta.url));
// Git variables of an outer git process (a hook of this repo runs `make gates`) must not point the temporary
// repositories at this one.
const ENV = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")));

function git(cwd, args) {
  execFileSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", ...args], {
    cwd,
    env: ENV,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/** A temporary repository with one commit; removed when the test ends, also when an assertion fails (#1297). */
function makeRepo(t, name) {
  const dir = mkdtempSync(join(tmpdir(), `${name}-`));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  git(dir, ["init", "-q", "-b", "main"]);
  git(dir, ["commit", "-q", "--allow-empty", "-m", "init"]);
  return dir;
}

/** The main checkout and one worktree under .worktrees/x, as agents work (AGENTS.md, rule 5). */
function checkout(t) {
  const main = makeRepo(t, "hook-main");
  const wt = join(main, ".worktrees", "x");
  git(main, ["worktree", "add", "-q", "-b", "fix/x", wt]);
  return { main, wt };
}

/**
 * The hook's output for one tool call of a session whose project is `session` and whose shell is in `cwd` (the
 * session folder by default): hookSpecificOutput, or null when the hook is silent. The hook swallows its own errors
 * (exit 0, message on stderr), so a line on stderr fails the test.
 */
function runHook(event, session, toolInput, cwd = session) {
  const result = spawnSync("node", [HOOK, event], {
    input: JSON.stringify({ tool_name: event === "guard-bash" ? "Bash" : "Edit", cwd, tool_input: toolInput }),
    env: { ...ENV, CLAUDE_PROJECT_DIR: session },
    encoding: "utf8",
  });
  assert.equal(result.stderr, "", `the hook reports an error for ${JSON.stringify(toolInput)}`);
  assert.equal(result.status, 0);
  return result.stdout === "" ? null : JSON.parse(result.stdout).hookSpecificOutput;
}
const guard = (session, toolInput) => runHook("guard-edit", session, toolInput);
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
  assert.equal(guard(wt, { file_path: join(wt, "app/packages/db/migrations/0003_missing.sql") }), null);
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
  assert.equal(guard(main, { file_path, old_string: '"count": 6', new_string: '"count": 5' }), null);
});

test("US-QG-07, FR-QG-17: a new gate file in a folder the worktree does not have yet asks", (t) => {
  const { main, wt } = checkout(t);
  assert.equal(existsSync(join(wt, "app")), false);
  assertAsks(
    guard(main, { file_path: join(wt, "app/tools/check/quality/new-check/limits.mjs"), content: "export {};\n" }),
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
  writeFileSync(join(wt, "app/tools/check/docs/specs/check-specs.mjs"), "console.error(`checked in ${process.cwd()}`);\nprocess.exit(1);\n");
  mkdirSync(join(wt, "docs/specs/product"), { recursive: true });
  const file_path = join(wt, "docs/specs/product/00-test.md");
  writeFileSync(file_path, "# test\n");
  const output = runHook("after-edit", main, { file_path });
  assert.match(output?.additionalContext ?? "", /^Spec check failed after editing docs\/specs\/product\/00-test\.md/);
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
  assert.equal(bash(main, `cd ${join(main, "missing")} ; git clean -fd`)?.permissionDecision, "deny");
});

test("US-QG-07: a repository other than the hook's is judged by its own folder, not as the main checkout", (t) => {
  const { main } = checkout(t);
  const other = makeRepo(t, "hook-other");
  // The project is `main`; the shell is in `other`. A reset there is an ordinary question, as before this guard.
  assert.equal(bash(main, "git reset --hard", other)?.permissionDecision, "ask");
});

// The gate file confirmations of one worktree (US-QG-07): the record lives in the worktree's git directory, keyed by branch.
const gitDirOf = (dir) => execFileSync("git", ["rev-parse", "--absolute-git-dir"], { cwd: dir, env: ENV, encoding: "utf8" }).trim();
const recordOf = (dir) => join(gitDirOf(dir), "claude-gate-confirmations.json");
/** The PostToolUse event of an edit that went through: after-edit records a confirmed gate file. */
const applied = (session, toolInput) => runHook("after-edit", session, toolInput);

test("US-QG-07: a gate file asks once per branch: after its edit went through, later edits pass, another gate file and another branch ask", (t) => {
  const { main, wt } = checkout(t);
  const makefile = join(wt, "Makefile");
  const pre = join(wt, ".githooks/pre-commit");
  assertAsks(guard(wt, { file_path: makefile }), /^Makefile defines a gate/);
  writeFileSync(makefile, "all:\n");
  assert.equal(applied(wt, { file_path: makefile }), null);
  assert.equal(guard(wt, { file_path: makefile }), null);
  // The folder the session started in does not matter: the file's own worktree and branch decide.
  assert.equal(guard(main, { file_path: makefile }), null);
  assertAsks(guard(wt, { file_path: pre }), /^\.githooks\/pre-commit defines a gate/);
  // A new branch asks again; the confirmation of fix/x stays for fix/x.
  git(wt, ["switch", "-q", "-c", "fix/y"]);
  assertAsks(guard(wt, { file_path: makefile }), /^Makefile defines a gate/);
  applied(wt, { file_path: makefile });
  assert.equal(guard(wt, { file_path: makefile }), null);
  git(wt, ["switch", "-q", "fix/x"]);
  assert.equal(guard(wt, { file_path: makefile }), null);
});

test("US-QG-07: a gate file asks in another worktree and on a detached HEAD; an edit on a detached HEAD records nothing", (t) => {
  const { main, wt } = checkout(t);
  const makefile = join(wt, "Makefile");
  const pre = join(wt, ".githooks/pre-commit");
  writeFileSync(makefile, "all:\n");
  applied(wt, { file_path: makefile });
  assert.equal(guard(wt, { file_path: makefile }), null);
  // Another worktree has its own record, which holds nothing for this file.
  const other = join(main, ".worktrees", "y");
  git(main, ["worktree", "add", "-q", "--detach", other]);
  assertAsks(guard(other, { file_path: join(other, "Makefile") }), /^Makefile defines a gate/);
  // A detached HEAD has no branch to key a record by: it always asks, and an edit there records nothing.
  git(wt, ["checkout", "-q", "--detach"]);
  assertAsks(guard(wt, { file_path: makefile }), /^Makefile defines a gate/);
  applied(wt, { file_path: pre });
  assertAsks(guard(wt, { file_path: pre }), /^\.githooks\/pre-commit defines a gate/);
  git(wt, ["switch", "-q", "fix/x"]);
  assertAsks(guard(wt, { file_path: pre }), /^\.githooks\/pre-commit defines a gate/);
  assert.equal(guard(wt, { file_path: makefile }), null);
});

test("US-QG-07: a confirmation record that is missing, unreadable or malformed asks, and an edit of the record itself asks", (t) => {
  const { wt } = checkout(t);
  const makefile = join(wt, "Makefile");
  const record = recordOf(wt);
  // An ordinary file records nothing.
  writeFileSync(join(wt, "notes.txt"), "x\n");
  applied(wt, { file_path: join(wt, "notes.txt") });
  assert.equal(existsSync(record), false);
  writeFileSync(makefile, "all:\n");
  assertAsks(guard(wt, { file_path: makefile }), /^Makefile defines a gate/);
  applied(wt, { file_path: makefile });
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
  // The record is written by the hook only: an edit of it asks, whatever it holds.
  rmSync(record, { recursive: true });
  assertAsks(guard(wt, { file_path: record }), /^claude-gate-confirmations\.json records which gate files/);
});
