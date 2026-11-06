import { after, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hintsFor } from "./git-hook-hints.mjs";

test("US-DEV-02: changed dependencies and migrations each produce one hint", () => {
  assert.deepEqual(
    hintsFor([
      "app/package-lock.json",
      "app/packages/web/package.json",
      "app/packages/db/migrations/0003_species.sql",
    ]),
    ["Dependencies changed: run make setup", "New migrations: run make migrate"],
  );
});

test("US-DEV-02: plain code or docs changes produce no hint", () => {
  assert.deepEqual(hintsFor(["app/packages/core/src/index.ts", "docs/guides/roadmap.md"]), []);
});

test("US-DEV-02: changes to hooks and the Node version are reported", () => {
  assert.deepEqual(hintsFor([".githooks/pre-push", ".nvmrc"]), [
    "Git hooks changed: run make hooks",
    "Node version changed: see .nvmrc",
  ]);
});

// US-DEV-02 (issue 1608): .githooks/pre-push runs for real. Git pushes into a local bare remote with the hooks of this
// checkout. A fake `make` on PATH records each `make gates` call and fails when MAKE_EXIT is set, so no gate runs and
// nothing reaches GitHub.
const HOOKS = fileURLToPath(new URL("../../../.githooks", import.meta.url));
const GIT_ENV = {
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "test",
  GIT_AUTHOR_EMAIL: "test@example.invalid",
  GIT_COMMITTER_NAME: "test",
  GIT_COMMITTER_EMAIL: "test@example.invalid",
};
const FAKE_MAKE = '#!/bin/sh\necho "$*" >> "$MAKE_LOG"\nexit "${MAKE_EXIT:-0}"\n';
const sandboxes = [];
after(() => {
  for (const dir of sandboxes) rmSync(dir, { recursive: true, force: true });
});

// The environment of a git call: the caller's git variables of an outer hook are dropped, so the checkout in cwd decides.
const DROPPED_VARS = new Set(["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "MAKE_EXIT"]);
function gitEnv(extra = {}) {
  const base = Object.entries({ ...process.env, ...GIT_ENV }).filter(
    ([name]) => !DROPPED_VARS.has(name),
  );
  return { ...Object.fromEntries(base), ...extra };
}

function gitOk(cwd, args) {
  const out = spawnSync("git", args, { cwd, env: gitEnv(), encoding: "utf8" });
  assert.equal(out.status, 0, `git ${args.join(" ")}: ${out.stderr}`);
  return out.stdout.trim();
}

// A bare remote, a checkout with origin/dev at its first commit, and an app/ folder whose need_setup checks pass.
function sandbox() {
  const dir = mkdtempSync(path.join(tmpdir(), "pre-push-"));
  sandboxes.push(dir);
  const bin = path.join(dir, "bin");
  mkdirSync(bin);
  writeFileSync(path.join(bin, "make"), FAKE_MAKE, { mode: 0o755 });
  const origin = path.join(dir, "origin.git");
  gitOk(dir, ["init", "--bare", "-q", origin]);
  const repo = path.join(dir, "repo");
  gitOk(dir, ["init", "-q", "-b", "dev", repo]);
  mkdirSync(path.join(repo, "app", "node_modules"), { recursive: true });
  mkdirSync(path.join(repo, "app", "tools", "check", "supply"), { recursive: true });
  writeFileSync(
    path.join(repo, "app", "tools", "check", "supply", "check-deps.mjs"),
    "process.exit(0);\n",
  );
  writeFileSync(path.join(repo, "README.md"), "dev\n");
  gitOk(repo, ["add", "-A"]);
  gitOk(repo, ["commit", "-q", "-m", "init"]);
  gitOk(repo, ["remote", "add", "origin", origin]);
  gitOk(repo, ["push", "-q", "origin", "dev"]);
  return { bin, repo, origin, log: path.join(dir, "make.log") };
}

// A push through the real hook: the fake make is first on PATH, and the make log names every `make` call.
function push(sb, args, extra = {}) {
  const env = gitEnv({
    PATH: `${sb.bin}${path.delimiter}${process.env.PATH}`,
    MAKE_LOG: sb.log,
    ...extra,
  });
  return spawnSync("git", ["-c", `core.hooksPath=${HOOKS}`, "push", ...args], {
    cwd: sb.repo,
    env,
    encoding: "utf8",
  });
}

const makeCalls = (sb) =>
  existsSync(sb.log) ? readFileSync(sb.log, "utf8").trim().split("\n").filter(Boolean) : [];

const remoteHas = (sb, branch) =>
  spawnSync("git", ["rev-parse", "-q", "--verify", `refs/heads/${branch}`], {
    cwd: sb.origin,
    env: gitEnv(),
    encoding: "utf8",
  }).status === 0;

// A commit on a new branch, with a file (content) or without one (an empty commit, dev's tree).
function branchCommit(sb, branch, { content = false } = {}) {
  gitOk(sb.repo, ["checkout", "-q", "-b", branch]);
  if (content) writeFileSync(path.join(sb.repo, `${branch}.txt`), "change\n");
  gitOk(sb.repo, ["add", "-A"]);
  gitOk(sb.repo, ["commit", "-q", "--allow-empty", "-m", `change on ${branch}`]);
}

test("US-DEV-02: a push that moves no ref runs no gate", () => {
  const sb = sandbox();
  const out = push(sb, ["origin", "dev"]);
  assert.equal(out.status, 0, out.stderr);
  assert.deepEqual(makeCalls(sb), []);
  assert.match(out.stdout + out.stderr, /nothing is pushed, no gate runs/);
});

test("US-DEV-02: deleting a ref runs no gate", () => {
  const sb = sandbox();
  gitOk(sb.repo, ["push", "-q", "origin", "dev:refs/heads/feat"]);
  const out = push(sb, ["origin", ":feat"]);
  assert.equal(out.status, 0, out.stderr);
  assert.deepEqual(makeCalls(sb), []);
  assert.match(out.stdout + out.stderr, /adds no content compared with origin\/dev, no gate runs/);
  assert.equal(remoteHas(sb, "feat"), false);
});

test("US-DEV-02: an empty commit with origin/dev's tree (the make claim push) runs no gate", () => {
  const sb = sandbox();
  branchCommit(sb, "claim-x");
  const out = push(sb, ["origin", "claim-x"]);
  assert.equal(out.status, 0, out.stderr);
  assert.deepEqual(makeCalls(sb), []);
  assert.equal(remoteHas(sb, "claim-x"), true);
});

test("US-DEV-02: a push that adds content runs make gates and goes through when they pass", () => {
  const sb = sandbox();
  branchCommit(sb, "feat-y", { content: true });
  const out = push(sb, ["origin", "feat-y"]);
  assert.equal(out.status, 0, out.stderr);
  assert.deepEqual(makeCalls(sb), ["gates"]);
  assert.equal(remoteHas(sb, "feat-y"), true);
});

test("US-DEV-02: a failing gate fails the push and the remote gets no ref", () => {
  const sb = sandbox();
  branchCommit(sb, "feat-z", { content: true });
  const out = push(sb, ["origin", "feat-z"], { MAKE_EXIT: "1" });
  assert.notEqual(out.status, 0);
  assert.match(out.stderr, /Push aborted: a gate failed/);
  assert.deepEqual(makeCalls(sb), ["gates"]);
  assert.equal(remoteHas(sb, "feat-z"), false);
});

test("US-DEV-02: when origin/dev cannot be read, an empty commit still runs the gates", () => {
  const sb = sandbox();
  gitOk(sb.repo, ["update-ref", "-d", "refs/remotes/origin/dev"]);
  branchCommit(sb, "claim-w");
  const out = push(sb, ["origin", "claim-w"]);
  assert.equal(out.status, 0, out.stderr);
  assert.deepEqual(makeCalls(sb), ["gates"]);
});

test("US-DEV-02: one ref with content in a push of several refs runs the gates once", () => {
  const sb = sandbox();
  branchCommit(sb, "claim-m");
  branchCommit(sb, "feat-m", { content: true });
  const out = push(sb, ["origin", "claim-m", "feat-m"]);
  assert.equal(out.status, 0, out.stderr);
  assert.deepEqual(makeCalls(sb), ["gates"]);
});
