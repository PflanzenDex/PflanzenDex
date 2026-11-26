// Tests of issue 2557 (US-QG-07, d-148): a gate file that equals its blob in origin/dev does not block the fingerprint check and is
// logged as `applied (origin/dev)`. A hidden write, a differing file, a missing origin/dev and a fresh worktree that differs still
// block. Real git, temporary repositories, each removed when its test ends.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { LOG_FILE } from "./gate-log.mjs";

const HOOK = fileURLToPath(new URL("./run.mjs", import.meta.url));
const ENV = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")),
);

const git = (root, args, stdio = "ignore") =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@x.invalid", ...args], {
    cwd: root,
    env: ENV,
    stdio,
    encoding: "utf8",
  });

function repo(t) {
  const root = mkdtempSync(join(tmpdir(), "gate-origin-dev-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, ["init", "-q", "-b", "main"]);
  writeFileSync(join(root, "Makefile"), "all:\n");
  writeFileSync(join(root, ".gitignore"), ".worktrees/\n");
  mkdirSync(join(root, ".claude/hooks"), { recursive: true });
  writeFileSync(join(root, ".claude/hooks/rules.test.mjs"), "// test\n");
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", "init"]);
  return root;
}

// A new commit on a side branch that changes the Makefile; origin/dev points to it, the checked-out branch stays behind.
function devAhead(root, content = "all:\nnew:\n") {
  git(root, ["checkout", "-q", "-b", "side"]);
  writeFileSync(join(root, "Makefile"), content);
  git(root, ["commit", "-q", "-am", "dev change"]);
  git(root, ["update-ref", "refs/remotes/origin/dev", "HEAD"]);
  git(root, ["checkout", "-q", "main"]);
}

function call(event, root, command = "npm test") {
  const result = spawnSync("node", [HOOK, event], {
    input: JSON.stringify({
      tool_name: "Bash",
      cwd: root,
      tool_input: { command },
      transcript_path: "/x/projects/p/main.jsonl",
    }),
    env: { ...ENV, CLAUDE_PROJECT_DIR: root },
    encoding: "utf8",
  });
  assert.equal(result.stderr, "", event);
  if (result.stdout === "") return null;
  const parsed = JSON.parse(result.stdout);
  return parsed.hookSpecificOutput ?? parsed;
}

const logOf = (root) => {
  const common = git(
    root,
    ["rev-parse", "--path-format=absolute", "--git-common-dir"],
    "pipe",
  ).trim();
  return readFileSync(join(common, LOG_FILE), "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
};

// The first call of a repository without origin/dev is refused once and stores its state.
const baseline = (root) => {
  call("guard-bash", root);
  call("guard-bash", root);
};

test("US-QG-07, issue 2557: a fast-forward to origin/dev passes the after-bash check and is logged as applied (origin/dev)", (t) => {
  const root = repo(t);
  baseline(root);
  devAhead(root);
  call("guard-bash", root);
  git(root, ["merge", "--ff-only", "-q", "origin/dev"]);
  assert.equal(call("after-bash", root), null);
  assert.ok(
    logOf(root).some(
      (l) =>
        l.decision === "applied (origin/dev)" && l.source === "after-bash" && l.file === "Makefile",
    ),
  );
  assert.equal(call("guard-bash", root), null, "the state is stored, the next command is judged");
});

test("US-QG-07, issue 2557: a hidden write that differs from origin/dev still blocks", (t) => {
  const root = repo(t);
  baseline(root);
  devAhead(root);
  call("guard-bash", root);
  writeFileSync(join(root, "Makefile"), "all:\nevil:\n");
  const out = call("after-bash", root);
  assert.equal(out?.decision, "block", JSON.stringify(out));
  assert.match(out.reason, /Makefile/);
});

test("US-QG-07, issue 2557: a write whose content equals origin/dev passes (the accepted limit: reviewed code only)", (t) => {
  const root = repo(t);
  baseline(root);
  devAhead(root, "all:\nnew:\n");
  call("guard-bash", root);
  writeFileSync(join(root, "Makefile"), "all:\nnew:\n");
  assert.equal(call("after-bash", root), null);
});

test("US-QG-07, issue 2557: without origin/dev a change still blocks (fail closed)", (t) => {
  const root = repo(t);
  baseline(root);
  call("guard-bash", root);
  writeFileSync(join(root, "Makefile"), "all:\nnew:\n");
  assert.equal(call("after-bash", root)?.decision, "block");
});

test("US-QG-07, issue 2557: a fresh worktree equal to origin/dev passes on its first Bash call; a differing or missing gate file blocks", (t) => {
  const root = repo(t);
  baseline(root);
  git(root, ["update-ref", "refs/remotes/origin/dev", "HEAD"]);
  git(root, ["worktree", "add", "-q", "-b", "fix/a", join(root, ".worktrees/a"), "origin/dev"]);
  assert.equal(call("guard-bash", root), null, "a fresh worktree from origin/dev is verified");
  assert.ok(logOf(root).some((l) => l.decision === "applied (origin/dev)"));

  git(root, ["worktree", "add", "-q", "-b", "fix/b", join(root, ".worktrees/b"), "origin/dev"]);
  writeFileSync(join(root, ".worktrees/b/Makefile"), "all:\nevil:\n");
  assert.equal(call("guard-bash", root)?.permissionDecision, "deny");

  git(root, ["worktree", "add", "-q", "-b", "fix/c", join(root, ".worktrees/c"), "origin/dev"]);
  rmSync(join(root, ".worktrees/c/Makefile"));
  assert.equal(
    call("guard-bash", root)?.permissionDecision,
    "deny",
    "a gate file of origin/dev is missing",
  );
});
