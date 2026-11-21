// Tests for the SubagentStop push check (US-QG-07, issue 2371): whether the origin head of the branch of an implementer or a
// ticket lead moved during its run. The functions take fakes for git and files; the wiring in run.mjs is tested with a
// temporary repository, a bare origin and real pushes (#1278: removed when each test ends).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { hasGitFile } from "./subagent-gates.mjs";
import { headAtStart, parseReflog, runStartSeconds, subagentPush } from "./subagent-push.mjs";

const HOOK = fileURLToPath(new URL("./run.mjs", import.meta.url));
// Git variables of an outer git process (a hook of this repo runs `make gates`) must not point the temporary repository at
// this one.
const ENV = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")),
);

const WORKTREES = "/main/.worktrees";
const AGENT = "/main/agent.jsonl";
// The start of the run, and the same instant in whole seconds (the reflog counts seconds).
const START = "2026-11-21T08:00:00.000Z";
const START_S = Date.parse(START) / 1000;

// One line of a transcript: a Bash call of an assistant message, as Claude Code writes them (JSON Lines).
const bashLine = (command, timestamp = START) =>
  JSON.stringify({
    type: "assistant",
    timestamp,
    message: { content: [{ type: "tool_use", name: "Bash", input: { command } }] },
  });

/** A transcript that starts at START and enters each folder with `cd <folder> && make gates`, in order. */
const transcriptIn = (...folders) =>
  `${folders.map((folder) => bashLine(`cd ${folder} && make gates`)).join("\n")}\n`;

/** The reflog output of `git log -g --date=unix --format="%H %gD"`, newest first; `entries` are [sha, epoch seconds]. */
const reflogText = (entries) =>
  entries.map(([sha, time]) => `${sha} refs/remotes/origin/feat/x@{${time}}`).join("\n") + "\n";

// A git error of a fake: the value that the fake throws instead of answering.
const gitError = () => new Error("fatal: not a git repository");

/**
 * The deps of subagentPush for one transcript. `repos` maps each worktree folder to its fakes: `branch` (null when detached),
 * `head` (the origin head now, null when there is none), `reflog` (the text) or a gitError() to throw.
 */
function fakeDeps(transcript, repos) {
  const answer = (value) => {
    if (value instanceof Error) throw value;
    return value;
  };
  return {
    worktreesDir: WORKTREES,
    isWorktree: (folder) => Object.hasOwn(repos, folder),
    readFile: (file) => (file === AGENT ? transcript : null),
    branchOf: (worktree) => answer(repos[worktree].branch),
    remoteHead: (worktree) => answer(repos[worktree].head),
    reflogText: (worktree) => answer(repos[worktree].reflog),
  };
}

const input = { agent_transcript_path: AGENT, stop_hook_active: false };
// Shas of the fakes: the reflog lines carry 40 hex digits, as git writes them.
const OLD = "a".repeat(40);
const NEW = "b".repeat(40);
const pushedDuringRun = (head = NEW) => ({
  branch: "feat/a",
  head,
  reflog: reflogText([
    [head, START_S + 30],
    [OLD, START_S - 60],
  ]),
});
const notPushed = (branch = "feat/a") => ({
  branch,
  head: OLD,
  reflog: reflogText([[OLD, START_S - 60]]),
});

test("US-QG-07 (#2371): a branch whose origin head moved during the run is not flagged", () => {
  const deps = fakeDeps(transcriptIn(`${WORKTREES}/a`), {
    [`${WORKTREES}/a`]: pushedDuringRun(),
  });
  assert.equal(subagentPush(input, deps), null);
});

test("US-QG-07 (#2371): a branch whose origin head did not move is flagged by name", () => {
  const deps = fakeDeps(transcriptIn(`${WORKTREES}/a`), { [`${WORKTREES}/a`]: notPushed() });
  const out = subagentPush(input, deps);
  assert.ok(out, "a flag is expected");
  assert.match(out.systemMessage, /no new commit pushed on feat\/a/);
  assert.match(out.systemMessage, /did not move during this run/);
  assert.equal(out.decision, undefined, "the hook never blocks");
  assert.equal(
    out.hookSpecificOutput,
    undefined,
    "additionalContext would make the subagent continue",
  );
});

test("US-QG-07 (#2371): no transcript, no timestamp or no worktrees known gives no output", () => {
  const repos = { [`${WORKTREES}/a`]: notPushed() };
  const onlyLs = `${bashLine("ls -la")}\n`;
  assert.equal(subagentPush(input, fakeDeps(onlyLs, repos)), null);
  assert.equal(subagentPush({}, fakeDeps(transcriptIn(`${WORKTREES}/a`), repos)), null);
  const noTimestamp = `${JSON.stringify({ message: { content: [{ type: "tool_use", name: "Bash", input: { command: `cd ${WORKTREES}/a && ls` } }] } })}\n`;
  assert.equal(subagentPush(input, fakeDeps(noTimestamp, repos)), null);
  const noDir = { ...fakeDeps(transcriptIn(`${WORKTREES}/a`), repos), worktreesDir: null };
  assert.equal(subagentPush(input, noDir), null);
});

test("US-QG-07 (#2371): with two worktrees, only the one whose head did not move is flagged", () => {
  const a = `${WORKTREES}/a`;
  const b = `${WORKTREES}/b`;
  const deps = fakeDeps(transcriptIn(a, b), {
    [a]: pushedDuringRun(),
    [b]: notPushed("feat/b"),
  });
  const out = subagentPush(input, deps);
  assert.match(out.systemMessage, /no new commit pushed on feat\/b/);
  assert.doesNotMatch(out.systemMessage, /feat\/a/);
});

test("US-QG-07 (#2371): a git error says nothing and never throws, and other worktrees are still checked", () => {
  const a = `${WORKTREES}/a`;
  const b = `${WORKTREES}/b`;
  for (const broken of ["branch", "head", "reflog"]) {
    const repo = { ...notPushed(), [broken]: gitError() };
    assert.doesNotThrow(() => subagentPush(input, fakeDeps(transcriptIn(a), { [a]: repo })));
    assert.equal(subagentPush(input, fakeDeps(transcriptIn(a), { [a]: repo })), null, broken);
  }
  const deps = fakeDeps(transcriptIn(a, b), {
    [a]: { ...notPushed(), reflog: gitError() },
    [b]: notPushed("feat/b"),
  });
  assert.match(subagentPush(input, deps).systemMessage, /feat\/b/);
  assert.equal(subagentPush(input, deps).systemMessage.includes("feat/a"), false);
});

test("US-QG-07 (#2371): a branch first pushed during the run is not flagged, though git would answer its oldest entry", () => {
  // Only one reflog entry, written after the start: `@{<start>}` would answer it and look like a head that did not move.
  const FIRST = "c".repeat(40);
  const deps = fakeDeps(transcriptIn(`${WORKTREES}/a`), {
    [`${WORKTREES}/a`]: {
      branch: "feat/a",
      head: FIRST,
      reflog: reflogText([[FIRST, START_S + 5]]),
    },
  });
  assert.equal(subagentPush(input, deps), null);
});

test("US-QG-07 (#2371): a detached HEAD or a branch without an origin head says nothing", () => {
  const a = `${WORKTREES}/a`;
  assert.equal(
    subagentPush(input, fakeDeps(transcriptIn(a), { [a]: { ...notPushed(), branch: null } })),
    null,
  );
  assert.equal(
    subagentPush(input, fakeDeps(transcriptIn(a), { [a]: { ...notPushed(), head: null } })),
    null,
  );
});

test("US-QG-07 (#2371): the run starts at the first timestamp of the transcript", () => {
  const text = [
    "not json",
    JSON.stringify({ type: "summary" }),
    JSON.stringify({ timestamp: 1234, type: "user" }),
    JSON.stringify({ timestamp: "2026-11-21T08:00:00.500Z", type: "user" }),
    JSON.stringify({ timestamp: "2026-11-21T09:00:00.000Z", type: "user" }),
  ].join("\n");
  assert.equal(runStartSeconds(text), START_S);
  assert.equal(runStartSeconds("not json\n"), null);
});

test("US-QG-07 (#2371): the reflog lines are read with their epoch seconds and the others are skipped", () => {
  const text = `${"a".repeat(40)} refs/remotes/origin/feat/x@{1000000100}\nnot a reflog line\n${"b".repeat(40)} refs/remotes/origin/feat/x@{1000000000}\n`;
  assert.deepEqual(parseReflog(text), [
    { sha: "a".repeat(40), time: 1000000100 },
    { sha: "b".repeat(40), time: 1000000000 },
  ]);
  assert.deepEqual(parseReflog(""), []);
});

test("US-QG-07 (#2371): the origin head at the start is the newest entry in an earlier whole second", () => {
  const entries = [
    { sha: "newer", time: START_S + 1 },
    { sha: "same-second", time: START_S },
    { sha: "older", time: START_S - 1 },
  ];
  assert.equal(headAtStart(entries, START_S), "older");
  assert.equal(headAtStart([{ sha: "later", time: START_S + 1 }], START_S), null);
});

/** A main checkout with a bare origin and a worktree .worktrees/x on the branch task/x, which is pushed in the past. */
function repoWithPushedWorktree(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "subagent-push-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const origin = join(root, "origin.git");
  const main = join(root, "main");
  const worktree = join(main, ".worktrees", "x");
  const git = (cwd, args, env = ENV) =>
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
      { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
  // The push of the branch happened in 2001, long before the run: its reflog entry is older than the start.
  const PAST = 1000000000;
  git(root, ["init", "-q", "--bare", origin]);
  mkdirSync(main);
  git(main, ["init", "-q", "-b", "base"]);
  git(main, ["commit", "-q", "--allow-empty", "-m", "base"]);
  git(main, ["remote", "add", "origin", origin]);
  git(main, ["push", "-q", "origin", "base"]);
  git(main, ["worktree", "add", "-q", "-b", "task/x", worktree, "base"]);
  git(worktree, ["commit", "-q", "--allow-empty", "-m", "first"]);
  git(worktree, ["push", "-q", "origin", "task/x"], {
    ...ENV,
    GIT_COMMITTER_DATE: `${PAST} +0000`,
  });
  const transcript = join(root, "agent.jsonl");
  const start = new Date((PAST + 100) * 1000).toISOString();
  writeFileSync(transcript, `${bashLine(`cd ${worktree} && make gates`, start)}\n`);
  return { root, main, worktree, transcript, git };
}

/** Runs the hook command of .claude/settings.json (`run.mjs subagent-push`) with a request, as Claude Code does. */
function runHook(main, request) {
  return spawnSync("node", [HOOK, "subagent-push"], {
    input: typeof request === "string" ? request : JSON.stringify(request),
    env: { ...ENV, CLAUDE_PROJECT_DIR: main },
    encoding: "utf8",
  });
}

test("US-QG-07 (#2371): the hook of run.mjs flags a branch that was not pushed, and is silent once it was pushed", (t) => {
  const { main, worktree, transcript, git } = repoWithPushedWorktree(t);
  assert.equal(hasGitFile(worktree), true);
  const request = { cwd: main, agent_transcript_path: transcript };

  const before = runHook(main, request);
  assert.equal(before.status, 0, before.stderr);
  assert.equal(before.stderr, "");
  assert.match(JSON.parse(before.stdout).systemMessage, /no new commit pushed on task\/x/);

  git(worktree, ["commit", "-q", "--allow-empty", "-m", "second"]);
  git(worktree, ["push", "-q", "origin", "task/x"]);
  const after = runHook(main, request);
  assert.equal(after.status, 0, after.stderr);
  assert.equal(after.stderr, "");
  assert.equal(after.stdout, "");
});

test("US-QG-07 (#2371): the push hook answers nothing and exits 0 for a request it cannot read", (t) => {
  const { main } = repoWithPushedWorktree(t);
  for (const request of ["not json", "[]", "null", ""]) {
    const result = runHook(main, request);
    assert.equal(result.status, 0, `${JSON.stringify(request)}: ${result.stderr}`);
    assert.equal(result.stderr, "");
    assert.equal(result.stdout, "");
  }
});
