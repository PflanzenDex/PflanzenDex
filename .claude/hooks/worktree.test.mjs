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

// A ui-text baseline with one entry; the edits below change only its count.
const baselineText = (count) =>
  `{\n  "maxTotal": ${count},\n  "entries": [{ "file": "app/packages/web/src/a.tsx", "count": ${count} }]\n}\n`;

test("US-QG-07, FR-QG-17: a session in the main checkout asks before an edit of a gate file in a worktree", (t) => {
  const { main, wt } = checkout(t);
  assertAsks(guard(main, { file_path: join(wt, "Makefile") }), /^Makefile defines a gate/);
});

test("US-QG-07, FR-QG-17: a session in the main checkout denies an edit of an applied migration in a worktree", (t) => {
  const { main, wt } = checkout(t);
  const dir = join(wt, "app/packages/db/migrations");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "0001_fixture.sql"), "select 1;\n");
  assert.equal(guard(main, { file_path: join(dir, "0001_fixture.sql") })?.permissionDecision, "deny");
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
