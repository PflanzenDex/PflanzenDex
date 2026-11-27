// Tests of issue 2578 (US-QG-07, d-162): a fresh worktree whose gate files equal origin/dev is verified although the repository holds
// symlinks to folders (the skill links under the .claude folder, which made `git hash-object` fail), a retargeted link still
// blocks, and a worktree that is removed while the hook runs drops out silently while a wiped gate file of a live one blocks.
// Real git, temporary repositories, each removed when its test ends.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HOOK = fileURLToPath(new URL("./run.mjs", import.meta.url));
const ENV = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")),
);

const git = (root, args) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@x.invalid", ...args], {
    cwd: root,
    env: ENV,
    stdio: "ignore",
  });

// A repository like the real one: gate files, a tracked symlink to a folder, a tracked symlink to a file, and origin/dev at HEAD.
function repo(t) {
  const root = mkdtempSync(join(tmpdir(), "gate-2578-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, ["init", "-q", "-b", "main"]);
  writeFileSync(join(root, "Makefile"), "all:\n");
  writeFileSync(join(root, ".gitignore"), ".worktrees/\nnode_modules/\n");
  mkdirSync(join(root, ".claude/hooks"), { recursive: true });
  writeFileSync(join(root, ".claude/hooks/rules.test.mjs"), "// test\n");
  mkdirSync(join(root, ".agents/skills/one"), { recursive: true });
  writeFileSync(join(root, ".agents/skills/one/SKILL.md"), "skill\n");
  mkdirSync(join(root, ".claude/skills"), { recursive: true });
  symlinkSync("../../.agents/skills/one", join(root, ".claude/skills/one"));
  symlinkSync("../Makefile", join(root, ".claude/skills/make-link"));
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", "init"]);
  git(root, ["update-ref", "refs/remotes/origin/dev", "HEAD"]);
  return root;
}

function call(event, root) {
  const result = spawnSync("node", [HOOK, event], {
    input: JSON.stringify({
      tool_name: "Bash",
      cwd: root,
      tool_input: { command: "npm test" },
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

// The main checkout is stored first, as in a running session.
const baseline = (root) => {
  call("guard-bash", root);
  call("guard-bash", root);
};

const addWorktree = (root, name) =>
  git(root, [
    "worktree",
    "add",
    "-q",
    "-b",
    `fix/${name}`,
    join(root, ".worktrees", name),
    "origin/dev",
  ]);

test("US-QG-07, issue 2578: a fresh worktree with links to folders and files, equal to origin/dev, passes before and after the command", (t) => {
  const root = repo(t);
  baseline(root);
  addWorktree(root, "a");
  // What make worktree leaves in a new worktree: ignored dependencies and untracked files that are no gate files.
  mkdirSync(join(root, ".worktrees/a/node_modules"), { recursive: true });
  writeFileSync(join(root, ".worktrees/a/.env.local"), "X=1\n");
  assert.equal(call("after-bash", root), null, "verified by the check after make worktree");
  assert.equal(call("guard-bash", root), null, "and silent in the next command");
});

test("US-QG-07, issue 2578: a link of a fresh worktree that points elsewhere than in origin/dev still blocks", (t) => {
  const root = repo(t);
  baseline(root);
  addWorktree(root, "b");
  rmSync(join(root, ".worktrees/b/.claude/skills/one"));
  symlinkSync("../../.claude", join(root, ".worktrees/b/.claude/skills/one"));
  assert.equal(call("guard-bash", root)?.permissionDecision, "deny");
});

test("US-QG-07, issue 2578: a worktree removed with git worktree remove drops out silently", (t) => {
  const root = repo(t);
  baseline(root);
  addWorktree(root, "c");
  call("guard-bash", root);
  assert.equal(call("guard-bash", root), null, "the worktree is stored");
  git(root, ["worktree", "remove", "--force", join(root, ".worktrees/c")]);
  assert.equal(call("after-bash", root), null);
  assert.equal(call("guard-bash", root), null);
});

test("US-QG-07, issue 2578: a worktree that lost its files but is still listed (removal under way) is no drift", (t) => {
  const root = repo(t);
  baseline(root);
  addWorktree(root, "d");
  call("guard-bash", root);
  assert.equal(call("guard-bash", root), null);
  const dir = join(root, ".worktrees/d");
  for (const name of readdirSync(dir))
    if (name !== ".git") rmSync(join(dir, name), { recursive: true, force: true });
  assert.equal(call("guard-bash", root), null);
});

test("US-QG-07, issue 2578: a gate file removed or changed in a live worktree, or in the main checkout, still blocks", (t) => {
  const root = repo(t);
  baseline(root);
  addWorktree(root, "e");
  call("guard-bash", root);
  assert.equal(call("guard-bash", root), null);
  rmSync(join(root, ".worktrees/e/Makefile"));
  assert.equal(
    call("guard-bash", root)?.permissionDecision,
    "deny",
    "one gate file of a live worktree",
  );
  assert.equal(call("guard-bash", root), null, "stored after the refusal");
  writeFileSync(join(root, "Makefile"), "all:\nevil:\n");
  assert.equal(call("after-bash", root)?.decision, "block", "the main checkout");
  rmSync(join(root, "Makefile"));
  rmSync(join(root, ".claude"), { recursive: true });
  rmSync(join(root, ".agents"), { recursive: true });
  assert.equal(
    call("after-bash", root)?.decision,
    "block",
    "all gate files of the session's own worktree",
  );
});
