// FR-DEV-10 (issue 1412): `make pr` retries a rate-limited `gh pr ready` a bounded number of times, reads the reset from the
// failing response and says what is left. US-DEV-13 (issue 1608): the order is the preflight (commitlint, the changelog
// check and the Lessons section of US-DEV-05, before anything is pushed), the push, a wait until GitHub shows the pushed
// head, and only then the mark, so the one
// CI run of the PR starts on that head. The script runs for real in a throwaway repository with a local bare remote; `gh`
// and `make` are fakes on PATH, so nothing reaches GitHub and the checks of the Makefile do not run.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "pr-ready.sh");
const repoRoot = path.resolve(path.dirname(script), "..", "..");
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

// Fake gh. `api` answers the pull request from PULL (a JSON file) with the head that the remote has now, or SERVED_HEAD
// when it is set. `pr ready` records the remote head it sees (SEEN), then fails with MESSAGE while FAIL_TIMES calls are
// left; once READY_MARK exists it answers like an already ready PR (wording of gh 2.102.1, which prints
// `Pull request #n is marked as "ready for review"`). `api -i graphql` answers with RESET as header.
const FAKE_GH = `#!/usr/bin/env bash
echo "$*" >> "$CALLS"
served_head() {
  if [ -n "$SERVED_HEAD" ]; then echo "$SERVED_HEAD"; else git --git-dir="$ORIGIN" rev-parse -q --verify refs/heads/feat/x; fi
}
case "$1" in
  pr)
    echo "$(git --git-dir="$ORIGIN" rev-parse -q --verify refs/heads/feat/x || echo none)" >> "$SEEN"
    n=$(cat "$COUNT" 2>/dev/null || echo 0)
    n=$((n + 1))
    echo "$n" > "$COUNT"
    if [ "$n" -le "$FAIL_TIMES" ]; then echo "$MESSAGE" >&2; exit 1; fi
    if [ -e "$READY_MARK" ]; then echo "! Pull request #7 (x) is marked as \\"ready for review\\"" >&2; exit 0; fi
    touch "$READY_MARK"
    echo "marked ready"
    ;;
  api)
    case "$2" in
      -i)
        printf 'HTTP/2.0 200 OK\\r\\nX-Ratelimit-Reset: %s\\r\\n\\r\\n{"errors":[]}\\n' "$RESET"
        ;;
      *pulls\\?*) jq -c --arg h "$(served_head)" '[.head.sha = $h]' "$PULL" ;;
      *pulls/*) jq --arg h "$(served_head)" '.head.sha = $h' "$PULL" ;;
      *)
        echo "unexpected gh api call: $2" >&2
        exit 2
        ;;
    esac
    ;;
  *)
    echo "unexpected gh call: $*" >&2
    exit 2
    ;;
esac
`;

// Fake make: only the two preflight targets run. Each call records its arguments, the environment it got and the remote head
// at that moment (one JSON line in MAKE_CALLS); PREFLIGHT_FAIL=<target> makes that target fail.
const FAKE_MAKE = `#!/usr/bin/env bash
remote="$(git --git-dir="$ORIGIN" rev-parse -q --verify refs/heads/feat/x || echo none)"
jq -cn --arg args "$*" --arg msg "$MSG" --arg title "$PR_TITLE" --arg body "$PR_BODY" \\
  --arg base "$PR_BASE_SHA" --arg ref "$PR_BASE_REF" --arg remote "$remote" \\
  '{args: $args, MSG: $msg, PR_TITLE: $title, PR_BODY: $body, PR_BASE_SHA: $base, PR_BASE_REF: $ref, remote: $remote}' >> "$MAKE_CALLS"
if [ -n "$PREFLIGHT_FAIL" ] && [ "$2" = "$PREFLIGHT_FAIL" ]; then
  echo "$2: refused by the test" >&2
  exit 1
fi
`;

const RATE_LIMIT = "GraphQL: API rate limit already exceeded for user ID 1.";
const PULL_READ = "api repos/{owner}/{repo}/pulls/7";

const readLines = (file) => {
  try {
    return readFileSync(file, "utf8").split("\n").filter(Boolean);
  } catch {
    return [];
  }
};

/** A checkout of `branch` with origin at its first commit and `unpushed` local commits; the fakes come first on PATH. */
function setup({
  branch = "feat/x",
  unpushed = 0,
  rejectPush = false,
  title = "feat(x): add a thing",
  body = "Story: US-DEV-13\n\n## Lessons\n\nnone\n",
} = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "pr-ready-test-"));
  madeDirs.push(dir);
  const bin = path.join(dir, "bin");
  mkdirSync(bin);
  for (const [name, text] of [
    ["gh", FAKE_GH],
    ["make", FAKE_MAKE],
  ]) {
    writeFileSync(path.join(bin, name), text);
    chmodSync(path.join(bin, name), 0o755);
  }
  const repo = path.join(dir, "repo");
  const origin = path.join(dir, "origin.git");
  git(dir, ["init", "--bare", "-q", origin]);
  git(dir, ["init", "-q", "-b", branch, repo]);
  // The Lessons check (US-DEV-05) runs from the repository root, so the throwaway checkout carries its module.
  const lessonsCheck = "app/tools/check/docs/agents/pr/pr-lessons.mjs";
  mkdirSync(path.dirname(path.join(repo, lessonsCheck)), { recursive: true });
  copyFileSync(path.join(repoRoot, lessonsCheck), path.join(repo, lessonsCheck));
  git(repo, ["add", "-A"]);
  git(repo, ["commit", "-q", "-m", "init"]);
  const baseSha = git(repo, ["rev-parse", "HEAD"]).trim();
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
  const pull = path.join(dir, "pull.json");
  writeFileSync(
    pull,
    JSON.stringify({
      number: 7,
      title,
      body,
      state: "open",
      draft: true,
      base: { ref: "dev", sha: baseSha },
      head: { ref: branch, sha: "0".repeat(40) },
    }),
  );
  return {
    branch,
    dir,
    bin,
    repo,
    origin,
    hook,
    pull,
    baseSha,
    calls: path.join(dir, "calls"),
    seen: path.join(dir, "seen"),
    count: path.join(dir, "count"),
    readyMark: path.join(dir, "ready"),
    makeCalls: path.join(dir, "make-calls"),
  };
}

const remoteHead = (ctx) => git(ctx.origin, ["rev-parse", `refs/heads/${ctx.branch}`]).trim();
const localHead = (ctx) => git(ctx.repo, ["rev-parse", "HEAD"]).trim();
const readyCalls = (out) => out.calls.filter((c) => c.startsWith("pr ready"));

/**
 * Runs the script in the checkout of ctx with the fakes on PATH. `calls` is every gh call, `seenAtReady` the remote head at
 * each `pr ready`, `makeCalls` every preflight call (arguments and environment).
 */
function runScript(
  ctx,
  { args = ["7"], failTimes = 0, resetIn = 0, message = RATE_LIMIT, env = {} } = {},
) {
  const result = spawnSync("bash", [script, ...args], {
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
      PULL: ctx.pull,
      MAKE_CALLS: ctx.makeCalls,
      FAIL_TIMES: String(failTimes),
      MESSAGE: message,
      RESET: String(Math.floor(Date.now() / 1000) + resetIn),
      PR_READY_HEAD_WAIT: "0",
      ...env,
    },
  });
  return {
    ...result,
    calls: readLines(ctx.calls),
    seenAtReady: readLines(ctx.seen),
    makeCalls: readLines(ctx.makeCalls).map((line) => JSON.parse(line)),
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
  assert.deepEqual(readyCalls(out), ["pr ready 7", "pr ready 7"]);
  assert.ok(out.calls.includes("api -i graphql -f query={ viewer { login } }"));
});

test("FR-DEV-10: when the reset is far away `make pr` does not wait; it exits 75 and says the branch is pushed and when to run it again", () => {
  const out = run({ failTimes: 5, resetIn: 3600 });
  assert.equal(out.status, 75);
  assert.match(
    out.stderr,
    /still reached; the branch is pushed, the PR is still a draft and no CI started/,
  );
  assert.match(out.stderr, /make pr PR=7/);
  assert.equal(readyCalls(out).length, 1, "no retry is made");
});

test("FR-DEV-10: the number of tries is bounded: after PR_READY_TRIES the run gives up with exit 75", () => {
  const out = run({ failTimes: 5, env: { PR_READY_TRIES: "2" } });
  assert.equal(out.status, 75);
  assert.equal(readyCalls(out).length, 2);
});

test("FR-DEV-10: an error that is not a rate limit is not retried and fails at once", () => {
  const out = run({
    failTimes: 5,
    message: "GraphQL: Could not resolve to a PullRequest",
  });
  assert.equal(out.status, 1);
  assert.match(out.stderr, /Could not resolve to a PullRequest/);
  assert.equal(readyCalls(out).length, 1);
});

test("US-DEV-13 (issue 1608): the preflight runs before the push, and the PR is marked ready only once GitHub shows the pushed head", () => {
  const ctx = setup({ unpushed: 1 });
  const oldRemote = remoteHead(ctx);
  const out = runScript(ctx);
  assert.equal(out.status, 0, out.stderr);
  assert.deepEqual(
    out.makeCalls.map((m) => m.remote),
    [oldRemote, oldRemote],
    "both preflight checks ran while the remote still had the previous head",
  );
  assert.deepEqual(out.seenAtReady, [localHead(ctx)], "gh marked the PR after the push");
  assert.equal(remoteHead(ctx), localHead(ctx), "the push went through");
});

test("US-DEV-13 (issue 1608): after a rate-limited retry the PR is still marked ready only on the pushed head", () => {
  const ctx = setup({ unpushed: 1 });
  const out = runScript(ctx, { failTimes: 1 });
  assert.equal(out.status, 0, out.stderr);
  assert.deepEqual(out.seenAtReady, [localHead(ctx), localHead(ctx)]);
  assert.equal(out.makeCalls.length, 2, "the preflight ran once, before the first mark");
});

test("US-DEV-13 (issue 1608): with nothing to push `make pr` still runs the preflight, marks the PR ready and exits 0", () => {
  const ctx = setup();
  const out = runScript(ctx);
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /marked ready/);
  assert.deepEqual(readyCalls(out), ["pr ready 7"]);
  assert.equal(out.makeCalls.length, 2);
  assert.equal(remoteHead(ctx), localHead(ctx));
});

test("US-DEV-13 (issue 1608): a title that fails commitlint pushes nothing, marks nothing and says how to fix it", () => {
  const ctx = setup({ unpushed: 1, title: "WIP stuff" });
  const oldRemote = remoteHead(ctx);
  const out = runScript(ctx, { env: { PREFLIGHT_FAIL: "commitlint" } });
  assert.equal(out.status, 1);
  assert.match(out.stderr, /fails commitlint; nothing was pushed or marked/);
  assert.match(out.stderr, /make pr-text/);
  assert.equal(remoteHead(ctx), oldRemote, "the remote head is unchanged");
  assert.deepEqual(readyCalls(out), [], "gh did not mark the PR");
  assert.equal(
    out.makeCalls.length,
    1,
    "the changelog check did not run after the title check failed",
  );
});

test("US-DEV-13 (issue 1608): a failing changelog check pushes nothing, marks nothing and names the news entry", () => {
  const ctx = setup({ unpushed: 1 });
  const oldRemote = remoteHead(ctx);
  const out = runScript(ctx, { env: { PREFLIGHT_FAIL: "changelog-check" } });
  assert.equal(out.status, 1);
  assert.match(out.stderr, /changelog check fails; nothing was pushed or marked/);
  assert.match(out.stderr, /news entry/);
  assert.equal(remoteHead(ctx), oldRemote, "the remote head is unchanged");
  assert.deepEqual(readyCalls(out), [], "gh did not mark the PR");
});

test("US-DEV-05 (issue 1747): a PR body without a Lessons section pushes nothing, marks nothing and points to the fill-in command and recap-and-learnings", () => {
  const ctx = setup({ unpushed: 1, body: "Story: US-DEV-13" });
  const oldRemote = remoteHead(ctx);
  const out = runScript(ctx);
  assert.equal(out.status, 1, out.stderr);
  assert.match(out.stderr, /no "## Lessons" section/);
  assert.match(
    out.stderr,
    /the Lessons section of the PR body fails; nothing was pushed or marked/,
  );
  assert.match(out.stderr, /Fill it with make pr-text BODY=/);
  assert.match(out.stderr, /recap-and-learnings/);
  assert.equal(remoteHead(ctx), oldRemote, "the remote head is unchanged");
  assert.deepEqual(readyCalls(out), [], "gh did not mark the PR");
  assert.equal(out.makeCalls.length, 2, "the commitlint and changelog checks ran before it");
});

for (const [label, lessons] of [
  ["an empty", "## Lessons\n\n<!-- one line per lesson, or none -->\n"],
  ["a malformed", "## Lessons\n\n- did a thing\n"],
]) {
  test(`US-DEV-05 (issue 1747): ${label} Lessons section refuses before anything is pushed`, () => {
    const ctx = setup({ unpushed: 1, body: `Story: US-DEV-13\n\n${lessons}` });
    const oldRemote = remoteHead(ctx);
    const out = runScript(ctx);
    assert.equal(out.status, 1, out.stderr);
    assert.match(
      out.stderr,
      /the Lessons section of the PR body fails; nothing was pushed or marked/,
    );
    assert.equal(remoteHead(ctx), oldRemote, "the remote head is unchanged");
    assert.deepEqual(readyCalls(out), [], "gh did not mark the PR");
  });
}

test("US-DEV-05 (issue 1747): a Lessons section with well-formed lines passes, and the PR is pushed and marked", () => {
  const body =
    "Story: US-DEV-05\n\n## Lessons\n\n- Gate hid it → gate ui-gates\n- Pitfall → PF-012\n";
  const ctx = setup({ unpushed: 1, body });
  const out = runScript(ctx);
  assert.equal(out.status, 0, out.stderr);
  assert.deepEqual(readyCalls(out), ["pr ready 7"]);
  assert.equal(remoteHead(ctx), localHead(ctx), "the push went through");
});

test("US-DEV-13 (issue 1608): the title and body reach the checks only as environment variables, never in a command line", () => {
  const title = 'feat(x): $(touch PWNED) "quoted" ; echo injected';
  const body = "Story: US-DEV-13\n\n## Lessons\n\n- $(touch PWNED) → skill recap-and-learnings";
  const ctx = setup({ unpushed: 1, title, body });
  const out = runScript(ctx);
  assert.equal(out.status, 0, out.stderr);
  assert.deepEqual(
    out.makeCalls.map((m) => m.args),
    ["-s commitlint", "-s changelog-check"],
  );
  assert.equal(out.makeCalls[0].MSG, title);
  assert.equal(out.makeCalls[1].PR_TITLE, title);
  assert.equal(out.makeCalls[1].PR_BODY, body);
  assert.equal(
    existsSync(path.join(ctx.repo, "PWNED")),
    false,
    "nothing in the title or body ran as a command",
  );
});

test("US-DEV-13 (issue 1608): a base commit that is not in the clone and cannot be fetched refuses before anything is pushed", () => {
  const ctx = setup({ unpushed: 1 });
  const pull = JSON.parse(readFileSync(ctx.pull, "utf8"));
  pull.base.sha = "f".repeat(40);
  writeFileSync(ctx.pull, JSON.stringify(pull));
  const oldRemote = remoteHead(ctx);
  const out = runScript(ctx);
  assert.equal(out.status, 1);
  assert.match(
    out.stderr,
    /is not in this clone and could not be fetched; nothing was pushed or marked/,
  );
  assert.equal(remoteHead(ctx), oldRemote, "the remote head is unchanged");
  assert.deepEqual(readyCalls(out), []);
  assert.equal(out.makeCalls.length, 0, "no check ran");
});

test("US-DEV-13 (issue 1608): when GitHub does not show the pushed head in time, the branch stays pushed, the PR a draft, and make pr says to run again", () => {
  const ctx = setup({ unpushed: 1 });
  const oldRemote = remoteHead(ctx);
  const out = runScript(ctx, { env: { SERVED_HEAD: oldRemote, PR_READY_HEAD_WAIT: "0" } });
  assert.equal(out.status, 1);
  assert.match(out.stderr, /GitHub shows .* after 0 s, not the pushed/);
  assert.match(out.stderr, /branch is pushed, the PR is still a draft and no CI started/);
  assert.match(out.stderr, /Run make pr PR=7 again/);
  assert.equal(remoteHead(ctx), localHead(ctx), "the push went through");
  assert.deepEqual(readyCalls(out), [], "gh did not mark the PR");
});

test("US-DEV-13 (issue 1608): a failed push exits 1, names the cause and marks nothing", () => {
  const ctx = setup({ unpushed: 1, rejectPush: true });
  const oldRemote = remoteHead(ctx);
  const out = runScript(ctx);
  assert.equal(out.status, 1);
  assert.match(out.stderr, /the push failed; the PR is not marked ready and no CI started/);
  assert.match(out.stderr, /run make pr PR=7 again/);
  assert.equal(out.calls.at(-1), "push", "the push was the last step");
  assert.deepEqual(readyCalls(out), [], "gh did not mark the PR");
  assert.equal(remoteHead(ctx), oldRemote, "the remote head is unchanged");
});

test("US-DEV-13 (issue 1608): a rate limit that gives up after the push leaves the branch pushed and the PR a draft", () => {
  const ctx = setup({ unpushed: 1 });
  const out = runScript(ctx, { failTimes: 5, resetIn: 3600 });
  assert.equal(out.status, 75);
  assert.equal(remoteHead(ctx), localHead(ctx), "the branch is pushed");
  assert.match(out.stderr, /the branch is pushed, the PR is still a draft and no CI started/);
  assert.equal(readyCalls(out).length, 1);
});

test("US-DEV-13 (issue 1608): a gh error that is not a rate limit, after the push, exits 1 and says the branch is pushed", () => {
  const ctx = setup({ unpushed: 1 });
  const out = runScript(ctx, {
    failTimes: 5,
    message: "GraphQL: Could not resolve to a PullRequest",
  });
  assert.equal(out.status, 1);
  assert.match(
    out.stderr,
    /marking the PR ready failed; the branch is pushed, the PR is still a draft/,
  );
  assert.equal(remoteHead(ctx), localHead(ctx), "the branch is pushed");
  assert.equal(readyCalls(out).length, 1);
});

test("US-DEV-13 (issue 1608): a second `make pr` works after a failed preflight, a head that did not show and a gh error", () => {
  const preflight = setup({ unpushed: 1 });
  assert.equal(runScript(preflight, { env: { PREFLIGHT_FAIL: "commitlint" } }).status, 1);
  const preflightAgain = runScript(preflight);
  assert.equal(preflightAgain.status, 0, preflightAgain.stderr);
  assert.deepEqual(readyCalls(preflightAgain), ["pr ready 7"]);
  assert.equal(remoteHead(preflight), localHead(preflight));

  const head = setup({ unpushed: 1 });
  assert.equal(runScript(head, { env: { SERVED_HEAD: remoteHead(head) } }).status, 1);
  const headAgain = runScript(head);
  assert.equal(headAgain.status, 0, headAgain.stderr);
  assert.deepEqual(readyCalls(headAgain), ["pr ready 7"]);

  const ready = setup({ unpushed: 1 });
  const failed = runScript(ready, {
    failTimes: 1,
    message: "GraphQL: Could not resolve to a PullRequest",
  });
  assert.equal(failed.status, 1);
  const readyAgain = runScript(ready, { failTimes: 0 });
  assert.equal(readyAgain.status, 0, readyAgain.stderr);
  assert.match(readyAgain.stdout, /marked ready/);
  assert.equal(readyCalls(readyAgain).length, 2);
  assert.equal(remoteHead(ready), localHead(ready));
});

test("US-DEV-13 (issue 1608): without PR=<n> the open PR of the branch is found over REST and marked ready", () => {
  const ctx = setup({ unpushed: 1 });
  const out = runScript(ctx, { args: [] });
  assert.equal(out.status, 0, out.stderr);
  assert.ok(
    out.calls.includes("api repos/{owner}/{repo}/pulls?state=open&head={owner}:feat%2Fx"),
    out.calls.join("\n"),
  );
  assert.ok(out.calls.includes(PULL_READ), out.calls.join("\n"));
  assert.deepEqual(readyCalls(out), ["pr ready 7"]);
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
    const marker = path.resolve(ctx.repo, git(ctx.repo, ["rev-parse", "--git-path", op]).trim());
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
