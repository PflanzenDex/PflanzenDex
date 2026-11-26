// Tests of the second layer, round 3 (US-QG-07, issue 2554, d-146): drift between two Bash calls refuses the next one, a worktree under
// .worktrees/ is watched too, a content change is found even when the mtime and the size stay the same, and a gate file that cannot
// be read blocks and is logged, never silent. Real git, temporary repositories, each removed when its test ends.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { LOG_FILE } from "./gate-log.mjs";

const HOOK = fileURLToPath(new URL("./run.mjs", import.meta.url));
const ENV = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")),
);

function repo(t) {
  const root = mkdtempSync(join(tmpdir(), "gate-layer3-"));
  t.after(() => {
    for (const dir of [root]) {
      try {
        chmodSync(join(dir, "Makefile"), 0o600);
      } catch {
        // Already readable or removed.
      }
    }
    rmSync(root, { recursive: true, force: true });
  });
  const git = (args) =>
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@x.invalid", ...args], {
      cwd: root,
      env: ENV,
      stdio: "ignore",
    });
  git(["init", "-q", "-b", "main"]);
  writeFileSync(join(root, "Makefile"), "all:\n");
  mkdirSync(join(root, ".claude/hooks"), { recursive: true });
  writeFileSync(join(root, ".claude/hooks/rules.test.mjs"), "// test\n");
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "init"]);
  return root;
}

function call(event, root, command = "npm test") {
  const result = spawnSync("node", [HOOK, event], {
    input: JSON.stringify({
      tool_name: event.endsWith("bash") ? "Bash" : "Edit",
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

// The first call of a repository stores its state and is refused once (no state yet); the tests start from that stored state.
const baseline = (root) => call("guard-bash", root);

test("US-QG-07, issue 2554, round 3: a gate file changed between two Bash calls, with no hook call, refuses the next Bash command", (t) => {
  const root = repo(t);
  assert.equal(baseline(root)?.permissionDecision, "deny", "the first call has no stored state");
  writeFileSync(join(root, "Makefile"), "all:\nclean:\n");
  const refused = call("guard-bash", root);
  assert.equal(refused?.permissionDecision, "deny");
  assert.match(
    refused.permissionDecisionReason,
    /Gate files changed outside the hook since the last check: Makefile/,
  );
  assert.equal(
    call("guard-bash", root),
    null,
    "the state is stored again, so the next command is judged",
  );
});

test("US-QG-07, issue 2554, round 3: a gate file of a worktree under .worktrees/ is watched: a change there refuses the next Bash command", (t) => {
  const root = repo(t);
  baseline(root);
  execFileSync("git", ["worktree", "add", "-q", "-b", "fix/y", join(root, ".worktrees/y")], {
    cwd: root,
    env: ENV,
    stdio: "ignore",
  });
  assert.equal(
    call("guard-bash", root)?.permissionDecision,
    "deny",
    "a new worktree has no stored state yet",
  );
  assert.equal(call("guard-bash", root), null);
  writeFileSync(join(root, ".worktrees/y/Makefile"), "all:\nx\n");
  const refused = call("guard-bash", root);
  assert.equal(refused?.permissionDecision, "deny");
  assert.match(refused.permissionDecisionReason, /\.worktrees\/y\/Makefile/);
});

test("US-QG-07, issue 2554, round 3: a content change of the same size with the same mtime is found: the hash is never reused", (t) => {
  const root = repo(t);
  baseline(root);
  const file = join(root, "Makefile");
  const before = statSync(file);
  call("guard-bash", root);
  writeFileSync(file, "ALL:\n");
  utimesSync(file, before.atime, before.mtime);
  const out = call("after-bash", root);
  assert.equal(out?.decision, "block", JSON.stringify(out));
  assert.match(out.reason, /Makefile/);
});

test("US-QG-07, issue 2554, round 3: a gate file that cannot be read blocks the next step and is logged, never silent", (t) => {
  const root = repo(t);
  baseline(root);
  call("guard-bash", root);
  chmodSync(join(root, "Makefile"), 0o000);
  const out = call("after-bash", root);
  assert.equal(out?.decision, "block", JSON.stringify(out));
  assert.match(out.reason, /could not be checked after this Bash command/);
  const common = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  const lines = readFileSync(join(common, LOG_FILE), "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
  assert.ok(
    lines.some(
      (l) =>
        l.decision === "blocked" && l.source === "after-bash" && l.file === "(fingerprint error)",
    ),
  );
});
