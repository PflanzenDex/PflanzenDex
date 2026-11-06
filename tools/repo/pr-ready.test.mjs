// FR-DEV-10 (#1412): `make pr` retries a rate-limited `gh pr ready` a bounded number of times, reads the reset from the
// failing response and says what is left. US-DEV-13 (#1547): it marks the PR ready before it pushes, so the push's
// `synchronize` run sees a PR that is not a draft. The script runs for real in a throwaway repository with a local bare
// remote; `gh` is a fake on PATH, so nothing reaches GitHub.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const script = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "pr-ready.sh",
);
const madeDirs = [];
after(() => {
  for (const dir of madeDirs) rmSync(dir, { recursive: true, force: true });
});

const GIT_ENV = {
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "test",
  GIT_AUTHOR_EMAIL: "test@example.invalid",
  GIT_COMMITTER_NAME: "test",
  GIT_COMMITTER_EMAIL: "test@example.invalid",
};

const git = (cwd, args) => {
  const out = spawnSync("git", args, {
    cwd,
    env: { ...process.env, ...GIT_ENV },
    encoding: "utf8",
  });
  assert.equal(out.status, 0, `git ${args.join(" ")}: ${out.stderr}`);
  return out.stdout;
};

// Fake gh. `pr ready` first records the head the remote has at that moment (SEEN), then fails with MESSAGE while
// FAIL_TIMES calls are left; once READY_MARK exists it answers like an already ready PR (wording of gh 2.102.1, which
// prints `Pull request #n is marked as "ready for review"`). `api -i graphql` answers with RESET as header.
const FAKE_GH = `#!/usr/bin/env bash
echo "$*" >> "$CALLS"
case "$1 $2" in
  "pr ready")
    echo "$(git --git-dir="$ORIGIN" rev-parse -q --verify refs/heads/feat/x || echo none)" >> "$SEEN"
    n=$(cat "$COUNT" 2>/dev/null || echo 0)
    n=$((n + 1))
    echo "$n" > "$COUNT"
    if [ "$n" -le "$FAIL_TIMES" ]; then echo "$MESSAGE" >&2; exit 1; fi
    if [ -e "$READY_MARK" ]; then echo "! Pull request #7 (x) is marked as \\"ready for review\\"" >&2; exit 0; fi
    touch "$READY_MARK"
    echo "marked ready"
    ;;
  "api -i")
    printf 'HTTP/2.0 200 OK\\r\\nX-Ratelimit-Reset: %s\\r\\n\\r\\n{"errors":[]}\\n' "$RESET"
    ;;
  *)
    echo "unexpected gh call: $*" >&2
    exit 2
    ;;
esac
`;

const RATE_LIMIT = "GraphQL: API rate limit already exceeded for user ID 1.";

const readLines = (file) => {
  try {
    return readFileSync(file, "utf8").split("\n").filter(Boolean);
  } catch {
    return [];
  }
};

/** A checkout of `branch` with origin at its first commit and `unpushed` local commits; the fake gh comes first on PATH. */
function setup({ branch = "feat/x", unpushed = 0, rejectPush = false } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "pr-ready-test-"));
  madeDirs.push(dir);
  const bin = path.join(dir, "bin");
  mkdirSync(bin);
  writeFileSync(path.join(bin, "gh"), FAKE_GH);
  chmodSync(path.join(bin, "gh"), 0o755);
  const repo = path.join(dir, "repo");
  const origin = path.join(dir, "origin.git");
  git(dir, ["init", "--bare", "-q", origin]);
  git(dir, ["init", "-q", "-b", branch, repo]);
  git(repo, ["commit", "-q", "--allow-empty", "-m", "init"]);
  git(repo, ["remote", "add", "origin", origin]);
  git(repo, ["push", "-q", "-u", "origin", branch]);
  for (let i = 1; i <= unpushed; i++) {
    git(repo, ["commit", "-q", "--allow-empty", "-m", `local ${i}`]);
  }
  const hook = path.join(origin, "hooks", "pre-receive");
  if (rejectPush) {
    // The remote refuses every push and records each attempt in CALLS.
    writeFileSync(
      hook,
      '#!/bin/sh\necho push >> "$CALLS"\necho "test: the remote refuses the push" >&2\nexit 1\n',
    );
    chmodSync(hook, 0o755);
  }
  return {
    branch,
    dir,
    bin,
    repo,
    origin,
    hook,
    calls: path.join(dir, "calls"),
    seen: path.join(dir, "seen"),
    count: path.join(dir, "count"),
    readyMark: path.join(dir, "ready"),
  };
}

const remoteHead = (ctx) =>
  git(ctx.origin, ["rev-parse", `refs/heads/${ctx.branch}`]).trim();
const localHead = (ctx) => git(ctx.repo, ["rev-parse", "HEAD"]).trim();

/** Runs the script as `make pr PR=7` in the checkout of ctx; `calls` is every gh call so far, `seenAtReady` the remote head per `pr ready`. */
function runScript(
  ctx,
  { failTimes = 0, resetIn = 0, message = RATE_LIMIT, env = {} } = {},
) {
  const result = spawnSync("bash", [script, "7"], {
    cwd: ctx.repo,
    encoding: "utf8",
    env: {
      ...process.env,
      ...GIT_ENV,
      PATH: `${ctx.bin}:${process.env.PATH}`,
      CALLS: ctx.calls,
      COUNT: ctx.count,
      SEEN: ctx.seen,
      READY_MARK: ctx.readyMark,
      ORIGIN: ctx.origin,
      FAIL_TIMES: String(failTimes),
      MESSAGE: message,
      RESET: String(Math.floor(Date.now() / 1000) + resetIn),
      ...env,
    },
  });
  return {
    ...result,
    calls: readLines(ctx.calls),
    seenAtReady: readLines(ctx.seen),
  };
}

/** A fresh setup with one run of the script; `unpushed` and `rejectPush` go to setup, the rest to runScript. */
function run({ unpushed = 0, rejectPush = false, ...opts } = {}) {
  return runScript(setup({ unpushed, rejectPush }), opts);
}

/** A refusal: exit 1, the reason and "nothing was changed", gh not called, the remote head unchanged. */
function assertRefused(ctx, out, reason, oldRemote) {
  assert.equal(out.status, 1, out.stderr);
  assert.match(out.stderr, reason);
  assert.match(out.stderr, /nothing was changed/);
  assert.deepEqual(out.calls, [], "gh was not called");
  assert.equal(remoteHead(ctx), oldRemote, "the remote head is unchanged");
}

test("FR-DEV-10: a rate-limited `make pr` waits for the reset, retries once and marks the PR ready", () => {
  const out = run({ failTimes: 1 });
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /marked ready/);
  assert.match(out.stderr, /retry 2 of 3/);
  assert.deepEqual(out.calls, [
    "pr ready 7",
    "api -i graphql -f query={ viewer { login } }",
    "pr ready 7",
  ]);
});

test("FR-DEV-10: when the reset is far away `make pr` does not wait; it exits 75 and says when to run it again", () => {
  const out = run({ failTimes: 5, resetIn: 3600 });
  assert.equal(out.status, 75);
  assert.match(
    out.stderr,
    /still reached; nothing was pushed and the PR is still a draft/,
  );
  assert.match(out.stderr, /make pr PR=7/);
  assert.equal(
    out.calls.filter((c) => c.startsWith("pr ready")).length,
    1,
    "no retry is made",
  );
});

test("FR-DEV-10: the number of tries is bounded: after PR_READY_TRIES the run gives up with exit 75", () => {
  const out = run({ failTimes: 5, env: { PR_READY_TRIES: "2" } });
  assert.equal(out.status, 75);
  assert.equal(out.calls.filter((c) => c.startsWith("pr ready")).length, 2);
});

test("FR-DEV-10: an error that is not a rate limit is not retried and fails at once", () => {
  const out = run({
    failTimes: 5,
    message: "GraphQL: Could not resolve to a PullRequest",
  });
  assert.equal(out.status, 1);
  assert.match(out.stderr, /Could not resolve to a PullRequest/);
  assert.equal(out.calls.filter((c) => c.startsWith("pr ready")).length, 1);
});

test("US-DEV-13 (#1547): with unpushed commits `make pr` marks the PR ready before it pushes, and pushes afterwards", () => {
  const ctx = setup({ unpushed: 1 });
  const oldRemote = remoteHead(ctx);
  const out = runScript(ctx);
  assert.equal(out.status, 0, out.stderr);
  assert.deepEqual(
    out.seenAtReady,
    [oldRemote],
    "gh ran while the remote still had the previous head",
  );
  assert.notEqual(oldRemote, localHead(ctx));
  assert.equal(remoteHead(ctx), localHead(ctx), "the push went through");
});

test("US-DEV-13 (#1547): after a rate-limited retry the push happens once, after the PR is marked ready", () => {
  const ctx = setup({ unpushed: 1 });
  const oldRemote = remoteHead(ctx);
  const out = runScript(ctx, { failTimes: 1 });
  assert.equal(out.status, 0, out.stderr);
  assert.deepEqual(out.seenAtReady, [oldRemote, oldRemote]);
  assert.equal(remoteHead(ctx), localHead(ctx));
});

test("US-DEV-13 (#1547): with nothing to push `make pr` still marks the PR ready and exits 0", () => {
  const ctx = setup();
  const out = runScript(ctx);
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /marked ready/);
  assert.deepEqual(out.calls, ["pr ready 7"]);
  assert.equal(remoteHead(ctx), localHead(ctx));
});

test("US-DEV-13 (#1547): a rate limit that gives up pushes nothing and does not claim that the branch was pushed", () => {
  const ctx = setup({ unpushed: 1 });
  const oldRemote = remoteHead(ctx);
  const out = runScript(ctx, { failTimes: 5, resetIn: 3600 });
  assert.equal(out.status, 75);
  assert.equal(remoteHead(ctx), oldRemote, "the remote head is unchanged");
  assert.doesNotMatch(out.stderr, /branch is pushed/);
  assert.match(out.stderr, /nothing was pushed and the PR is still a draft/);
  assert.match(out.stderr, /make pr PR=7/);
  assert.equal(out.calls.filter((c) => c.startsWith("pr ready")).length, 1);
});

test("US-DEV-13 (#1547): a gh error that is not a rate limit pushes nothing and exits 1", () => {
  const ctx = setup({ unpushed: 1 });
  const oldRemote = remoteHead(ctx);
  const out = runScript(ctx, {
    failTimes: 5,
    message: "GraphQL: Could not resolve to a PullRequest",
  });
  assert.equal(out.status, 1);
  assert.match(out.stderr, /marking the PR ready failed; nothing was pushed/);
  assert.equal(remoteHead(ctx), oldRemote, "the remote head is unchanged");
  assert.equal(out.calls.filter((c) => c.startsWith("pr ready")).length, 1);
});

test("US-DEV-13 (#1547): when the push fails after the PR is marked ready, the run exits 1 and says the PR is ready with its old head", () => {
  const ctx = setup({ unpushed: 1, rejectPush: true });
  const oldRemote = remoteHead(ctx);
  const out = runScript(ctx);
  assert.equal(out.status, 1);
  assert.match(out.stderr, /the PR is marked ready, but the push failed/);
  assert.match(out.stderr, /ready for review with its previous head/);
  assert.match(out.stderr, /run make pr PR=7 again/);
  assert.deepEqual(out.calls, ["pr ready 7", "push"]);
  assert.equal(remoteHead(ctx), oldRemote, "the remote head is unchanged");
});

test("US-DEV-13 (#1547): a second `make pr` after a failed push works: gh reports the PR as already ready and the push goes through", () => {
  const ctx = setup({ unpushed: 1, rejectPush: true });
  const first = runScript(ctx);
  assert.equal(first.status, 1);
  rmSync(ctx.hook);
  const second = runScript(ctx);
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /is marked as "ready for review"/);
  assert.deepEqual(second.calls, ["pr ready 7", "push", "pr ready 7"]);
  assert.equal(remoteHead(ctx), localHead(ctx), "the push went through");
});

test("US-DEV-13 (#1547): make pr refuses on main and changes nothing", () => {
  const ctx = setup({ branch: "main", unpushed: 1 });
  const oldRemote = remoteHead(ctx);
  assertRefused(ctx, runScript(ctx), /takes no direct commits/, oldRemote);
});

test("US-DEV-13 (#1547): make pr refuses on dev and changes nothing", () => {
  const ctx = setup({ branch: "dev", unpushed: 1 });
  const oldRemote = remoteHead(ctx);
  assertRefused(ctx, runScript(ctx), /takes no direct commits/, oldRemote);
});

test("US-DEV-13 (#1547): make pr refuses on a detached HEAD and changes nothing", () => {
  const ctx = setup({ unpushed: 1 });
  git(ctx.repo, ["checkout", "-q", "--detach"]);
  const oldRemote = remoteHead(ctx);
  assertRefused(ctx, runScript(ctx), /detached HEAD/, oldRemote);
});

for (const op of [
  "rebase-merge",
  "rebase-apply",
  "MERGE_HEAD",
  "CHERRY_PICK_HEAD",
  "REVERT_HEAD",
]) {
  test(`US-DEV-13 (#1547): make pr refuses while ${op} is in progress and changes nothing`, () => {
    const ctx = setup({ unpushed: 1 });
    const marker = path.resolve(
      ctx.repo,
      git(ctx.repo, ["rev-parse", "--git-path", op]).trim(),
    );
    if (op.startsWith("rebase-")) mkdirSync(marker);
    else writeFileSync(marker, `${localHead(ctx)}\n`);
    const oldRemote = remoteHead(ctx);
    assertRefused(ctx, runScript(ctx), /in progress/, oldRemote);
  });
}

test("US-DEV-13 (#1547): make pr refuses with uncommitted changes and changes nothing", () => {
  const ctx = setup({ unpushed: 1 });
  writeFileSync(path.join(ctx.repo, "notes.txt"), "not committed\n");
  const oldRemote = remoteHead(ctx);
  assertRefused(ctx, runScript(ctx), /uncommitted changes/, oldRemote);
});
