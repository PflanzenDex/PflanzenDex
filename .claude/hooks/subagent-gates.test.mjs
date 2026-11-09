// Tests for the SubagentStop gate of the implementers (US-QG-07, US-DEV-02): which worktree an implementer worked in, when
// `make gates` runs again, and what the hook answers. The functions take fakes for git and processes; the wiring in run.mjs
// is tested with a temporary repository (#1278: removed when each test ends).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  LOCK_BUSY_EXIT,
  STAMP_NAME,
  failedSteps,
  hasGitFile,
  needsRun,
  subagentStop,
  worktreeFromTranscript,
} from "./subagent-gates.mjs";

const HOOK = fileURLToPath(new URL("./run.mjs", import.meta.url));
// Git variables of an outer git process (a hook of this repo runs `make gates`) must not point the temporary repository at
// this one.
const ENV = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")),
);

/** A main checkout with a .worktrees folder; each named worktree is a folder with a `.git` file, as git makes one. */
function checkoutWithWorktrees(t, names) {
  const main = mkdtempSync(join(tmpdir(), "subagent-gates-"));
  t.after(() => rmSync(main, { recursive: true, force: true }));
  mkdirSync(join(main, ".git"));
  for (const name of names) {
    const dir = join(main, ".worktrees", name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, ".git"), `gitdir: ${join(main, ".git", "worktrees", name)}\n`);
  }
  return main;
}

// One line of a transcript: an assistant message with a Bash call, as Claude Code writes them (JSON Lines).
const bashLine = (command) =>
  JSON.stringify({
    type: "assistant",
    message: {
      content: [{ type: "tool_use", name: "Bash", input: { command } }],
    },
  });
const transcriptOf = (...commands) => `${commands.map(bashLine).join("\n")}\n`;

test("US-QG-07: the worktree of a transcript is the one entered by its last cd", (t) => {
  const main = checkoutWithWorktrees(t, ["a", "b"]);
  const workDir = join(main, ".worktrees");
  const a = join(workDir, "a");
  const b = join(workDir, "b");
  const text = transcriptOf(`cd ${a} && git status`, `cd ${b} && make gates`);
  assert.equal(worktreeFromTranscript(text, workDir), b);
});

test("US-QG-07: a folder inside a worktree counts for that worktree", (t) => {
  const main = checkoutWithWorktrees(t, ["a"]);
  const workDir = join(main, ".worktrees");
  const text = transcriptOf(`cd ${join(workDir, "a", "app")} && npm run lint`);
  assert.equal(worktreeFromTranscript(text, workDir), join(workDir, "a"));
});

test("US-QG-07: a transcript without a cd into a worktree gives no worktree", (t) => {
  const main = checkoutWithWorktrees(t, ["a"]);
  const workDir = join(main, ".worktrees");
  const text = transcriptOf("ls -la", `cd ${main} && ls`, "cd relative/path && make ci");
  assert.equal(worktreeFromTranscript(text, workDir), null);
  assert.equal(worktreeFromTranscript("", workDir), null);
});

test("US-QG-07: a cd to a folder that is no worktree is ignored", (t) => {
  const main = checkoutWithWorktrees(t, ["a"]);
  const workDir = join(main, ".worktrees");
  const a = join(workDir, "a");
  mkdirSync(join(workDir, "not-a-worktree"));
  const text = transcriptOf(
    `cd ${a} && make gates`,
    `cd ${join(workDir, "not-a-worktree")} && ls`,
    `cd ${join(main, "elsewhere")} && ls`,
  );
  assert.equal(worktreeFromTranscript(text, workDir), a);
});

test("US-QG-07: a quoted cd and a cd after a semicolon are read; other tool calls are not", (t) => {
  const main = checkoutWithWorktrees(t, ["a", "b"]);
  const workDir = join(main, ".worktrees");
  const b = join(workDir, "b");
  const editCall = JSON.stringify({
    type: "assistant",
    message: {
      content: [
        {
          type: "tool_use",
          name: "Edit",
          input: { file_path: join(workDir, "a", "x") },
        },
      ],
    },
  });
  const text = `${[bashLine(`cd "${b}" && ls`), "not json", editCall].join("\n")}\n`;
  assert.equal(worktreeFromTranscript(text, workDir), b);
  assert.equal(worktreeFromTranscript(transcriptOf(`x=1; cd ${b} && make gates`), workDir), b);
  assert.equal(worktreeFromTranscript(`${editCall}\n`, workDir), null);
  assert.equal(hasGitFile(join(workDir, "a")), true);
  assert.equal(hasGitFile(main), false);
});

test("US-QG-07: a green stamp for the same head and code needs no run", () => {
  const green = { exit: 0, head: "h1", fingerprint: "f1" };
  assert.equal(needsRun(green, { head: "h1", fingerprint: "f1" }), false);
});

test("US-QG-07: a red stamp, another head, changed code or no stamp needs a run", () => {
  const now = { head: "h1", fingerprint: "f1" };
  assert.equal(needsRun({ exit: 1, head: "h1", fingerprint: "f1" }, now), true);
  assert.equal(needsRun({ exit: 0, head: "h0", fingerprint: "f1" }, now), true);
  assert.equal(needsRun({ exit: 0, head: "h1", fingerprint: "f0" }, now), true);
  assert.equal(needsRun(null, now), true);
});

test("US-QG-07: without a code change against origin/dev nothing needs a run", () => {
  assert.equal(needsRun(null, { head: "h1", fingerprint: null }), false);
  assert.equal(
    needsRun({ exit: 1, head: "h1", fingerprint: "f1" }, { head: "h1", fingerprint: null }),
    false,
  );
});

test("US-QG-07: the failing steps are named from the summary of make gates", () => {
  const output = [
    "--- lint: FAILED in 3.1 s",
    "error: unused variable",
    "gates: 2 steps in 9.0 s, at most 4 at a time, 2 failed",
    "  FAILED lint: re-run: npm run lint",
    "  FAILED typecheck: re-run: npm run typecheck",
    "",
  ].join("\n");
  assert.deepEqual(failedSteps(output), ["lint", "typecheck"]);
  assert.deepEqual(failedSteps("make: *** [Makefile:1: gates] Error 2\n"), []);
});

/** The hook's functions for one test: the worktree is a real folder, git and the runner are fakes (`run` gives the result). */
function stopDeps(main, run, { head = "h1", fingerprint = "f1" } = {}) {
  const runs = [];
  const deps = {
    worktreesDir: join(main, ".worktrees"),
    isWorktree: hasGitFile,
    readFile: (file) => (existsSync(file) ? readFileSync(file, "utf8") : null),
    writeFile: (file, text) => writeFileSync(file, text),
    stampFile: (worktree) => join(worktree, STAMP_NAME),
    head: () => head,
    fingerprint: () => fingerprint,
    runGates: (worktree) => {
      runs.push(worktree);
      return run(worktree);
    },
    now: () => "2026-11-09T10:00:00.000Z",
  };
  return { deps, runs };
}

/** A main checkout with the worktree `a`, and the transcript of an implementer that worked in it. */
function implementerEnded(t) {
  const main = checkoutWithWorktrees(t, ["a"]);
  const worktree = join(main, ".worktrees", "a");
  const transcriptPath = join(main, "agent.jsonl");
  writeFileSync(transcriptPath, transcriptOf(`cd ${worktree} && make ci`));
  return {
    main,
    worktree,
    input: { agent_transcript_path: transcriptPath, stop_hook_active: false },
  };
}

const GREEN = () => ({ exit: 0, output: "gates: 9 steps\n", durationMs: 1500 });

test("US-QG-07: a red make gates blocks the end once, naming the failing step and its output", (t) => {
  const { main, worktree, input } = implementerEnded(t);
  const output = "step output\nerror: unused variable\n  FAILED lint: re-run: npm run lint\n";
  const { deps, runs } = stopDeps(main, () => ({
    exit: 2,
    output,
    durationMs: 1234,
  }));
  const hook = subagentStop(input, deps);
  assert.equal(hook.decision, "block");
  assert.ok(hook.reason.includes(`make gates failed in ${worktree} (exit 2)`), hook.reason);
  assert.match(hook.reason, /Failed step: lint/);
  assert.match(hook.reason, /error: unused variable/);
  assert.deepEqual(runs, [worktree]);
  assert.deepEqual(JSON.parse(readFileSync(join(worktree, STAMP_NAME), "utf8")), {
    command: "make gates",
    exit: 2,
    durationMs: 1234,
    head: "h1",
    fingerprint: "f1",
    at: "2026-11-09T10:00:00.000Z",
  });
});

test("US-QG-07: a green make gates ends silently and writes the stamp", (t) => {
  const { main, worktree, input } = implementerEnded(t);
  const { deps, runs } = stopDeps(main, GREEN);
  assert.equal(subagentStop(input, deps), null);
  assert.deepEqual(runs, [worktree]);
  const stamp = JSON.parse(readFileSync(join(worktree, STAMP_NAME), "utf8"));
  assert.equal(stamp.exit, 0);
  assert.equal(stamp.head, "h1");
  assert.equal(stamp.fingerprint, "f1");
});

test("US-QG-07: a lock held past the wait neither blocks nor writes a stamp, and tells the orchestrator", (t) => {
  const { main, worktree, input } = implementerEnded(t);
  const { deps } = stopDeps(main, () => ({
    exit: LOCK_BUSY_EXIT,
    output: "",
    durationMs: 1,
  }));
  const hook = subagentStop(input, deps);
  assert.equal(hook.decision, undefined);
  assert.match(hook.systemMessage, /make gates did not run/);
  assert.equal(existsSync(join(worktree, STAMP_NAME)), false);
});

test("US-QG-07: a red make gates after a block is reported to the orchestrator, not blocked again", (t) => {
  const { main, input } = implementerEnded(t);
  const { deps } = stopDeps(main, () => ({
    exit: 2,
    output: "  FAILED typecheck: re-run: x\n",
    durationMs: 1,
  }));
  const hook = subagentStop({ ...input, stop_hook_active: true }, deps);
  assert.equal(hook.decision, undefined);
  assert.match(hook.systemMessage, /make gates is still red in .*\(exit 2\)/);
  assert.match(hook.systemMessage, /Failed step: typecheck/);
});

test("US-QG-07: a green stamp for the same head and code ends the implementer without a second run", (t) => {
  const { main, worktree, input } = implementerEnded(t);
  const stamp = {
    command: "make gates",
    exit: 0,
    durationMs: 1,
    head: "h1",
    fingerprint: "f1",
    at: "x",
  };
  writeFileSync(join(worktree, STAMP_NAME), JSON.stringify(stamp));
  const { deps, runs } = stopDeps(main, GREEN);
  assert.equal(subagentStop(input, deps), null);
  assert.deepEqual(runs, []);
});

test("US-QG-07: without a worktree or a code change nothing runs", (t) => {
  const { main, worktree, input } = implementerEnded(t);
  const elsewhere = stopDeps(main, GREEN);
  writeFileSync(input.agent_transcript_path, transcriptOf("ls -la"));
  assert.equal(subagentStop(input, elsewhere.deps), null);
  assert.deepEqual(elsewhere.runs, []);

  writeFileSync(input.agent_transcript_path, transcriptOf(`cd ${worktree} && ls`));
  const docsOnly = stopDeps(main, GREEN, { fingerprint: null });
  assert.equal(subagentStop(input, docsOnly.deps), null);
  assert.deepEqual(docsOnly.runs, []);

  assert.equal(subagentStop({ stop_hook_active: false }, elsewhere.deps), null);
  assert.deepEqual(elsewhere.runs, []);
});

test("US-QG-07: the SubagentStop handler of run.mjs stays silent for a transcript without a worktree", (t) => {
  const main = mkdtempSync(join(tmpdir(), "subagent-hook-"));
  t.after(() => rmSync(main, { recursive: true, force: true }));
  const git = (args) =>
    execFileSync(
      "git",
      ["-c", "user.name=test", "-c", "user.email=test@example.invalid", ...args],
      {
        cwd: main,
        env: ENV,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  git(["init", "-q", "-b", "main"]);
  git(["commit", "-q", "--allow-empty", "-m", "init"]);
  mkdirSync(join(main, ".worktrees", "x"), { recursive: true });
  const transcriptPath = join(main, "agent.jsonl");
  writeFileSync(transcriptPath, transcriptOf(`cd ${join(main, ".worktrees", "x")} && ls`));
  const result = spawnSync("node", [HOOK, "subagent-stop"], {
    input: JSON.stringify({
      cwd: main,
      agent_transcript_path: transcriptPath,
      stop_hook_active: false,
    }),
    env: { ...ENV, CLAUDE_PROJECT_DIR: main },
    encoding: "utf8",
  });
  assert.equal(result.stderr, "");
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
});
