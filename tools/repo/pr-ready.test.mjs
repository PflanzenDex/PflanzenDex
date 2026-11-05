// FR-DEV-10 (#1412): `make pr` retries a rate-limited `gh pr ready` a bounded number of times, reads the reset from the
// failing response and says what is left. The script runs for real in a throwaway repository with a local bare remote;
// `gh` is a fake on PATH, so nothing reaches GitHub.
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

// Fake gh: `pr ready` fails with the message while FAIL_TIMES calls are left; `api -i graphql` answers with RESET as header.
const FAKE_GH = `#!/usr/bin/env bash
echo "$*" >> "$CALLS"
case "$1 $2" in
  "pr ready")
    n=$(cat "$COUNT" 2>/dev/null || echo 0)
    n=$((n + 1))
    echo "$n" > "$COUNT"
    if [ "$n" -le "$FAIL_TIMES" ]; then echo "$MESSAGE" >&2; exit 1; fi
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

/** A checkout on feat/x with origin, a fake gh first on PATH; returns the run of `make pr PR=7`. */
function run({ failTimes, resetIn = 0, message = RATE_LIMIT, env = {} }) {
  const dir = mkdtempSync(path.join(tmpdir(), "pr-ready-test-"));
  madeDirs.push(dir);
  const bin = path.join(dir, "bin");
  mkdirSync(bin);
  writeFileSync(path.join(bin, "gh"), FAKE_GH);
  chmodSync(path.join(bin, "gh"), 0o755);
  const repo = path.join(dir, "repo");
  const origin = path.join(dir, "origin.git");
  git(dir, ["init", "--bare", "-q", origin]);
  git(dir, ["init", "-q", "-b", "feat/x", repo]);
  git(repo, ["commit", "-q", "--allow-empty", "-m", "init"]);
  git(repo, ["remote", "add", "origin", origin]);
  git(repo, ["push", "-q", "-u", "origin", "feat/x"]);
  const calls = path.join(dir, "calls");
  const result = spawnSync("bash", [script, "7"], {
    cwd: repo,
    encoding: "utf8",
    env: {
      ...process.env,
      ...GIT_ENV,
      PATH: `${bin}:${process.env.PATH}`,
      CALLS: calls,
      COUNT: path.join(dir, "count"),
      FAIL_TIMES: String(failTimes),
      MESSAGE: message,
      RESET: String(Math.floor(Date.now() / 1000) + resetIn),
      ...env,
    },
  });
  const calledGh = () => {
    try {
      return readFileSync(calls, "utf8").trim().split("\n");
    } catch {
      return [];
    }
  };
  return { ...result, calls: calledGh() };
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
    /still reached; the branch is pushed, the PR is still a draft/,
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
