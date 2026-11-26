// Tests for the second layer of the gate guard (US-QG-07, issue 2554, round 2): the fingerprint of the gate files before and after
// each Bash command. The test plays the shell: it changes a gate file between the two hook calls, as a command the denylist does not
// judge would. Real git, temporary repositories, each removed when its test ends.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FINGERPRINT_FILE } from "./gate-names.mjs";
import { LOG_FILE } from "./gate-log.mjs";

const HOOK = fileURLToPath(new URL("./run.mjs", import.meta.url));
const ENV = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")),
);

function repo(t) {
  const root = mkdtempSync(join(tmpdir(), "gate-layer2-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (args) =>
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@x.invalid", ...args], {
      cwd: root,
      env: ENV,
      stdio: "ignore",
    });
  git(["init", "-q", "-b", "main"]);
  for (const [file, text] of [
    ["Makefile", "all:\n"],
    ["AGENTS.md", "rules\n"],
    [".claude/hooks/rules.test.mjs", "// test\n"],
  ]) {
    mkdirSync(join(root, file, ".."), { recursive: true });
    writeFileSync(join(root, file), text);
  }
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "init"]);
  return root;
}

// One hook call: the output (hookSpecificOutput for PreToolUse, the decision object for PostToolUse) or null.
function call(event, root, { command = "npm test", extra = {} } = {}) {
  const result = spawnSync("node", [HOOK, event], {
    input: JSON.stringify({
      tool_name: event.endsWith("bash") ? "Bash" : "Edit",
      cwd: root,
      tool_input: { command },
      ...extra,
    }),
    env: { ...ENV, CLAUDE_PROJECT_DIR: root },
    encoding: "utf8",
  });
  assert.equal(result.stderr, "", event);
  if (result.stdout === "") return null;
  const parsed = JSON.parse(result.stdout);
  return parsed.hookSpecificOutput ?? parsed;
}

// The state of a Bash command: the guard before it, then the change, then the after-bash check.
const bashAround = (root, change, extra = {}) => {
  call("guard-bash", root, { extra });
  change();
  return call("after-bash", root, { extra });
};

test("US-QG-07, issue 2554, round 2: a gate file that a Bash command changes, outside the denylist, blocks the next step and names the file", (t) => {
  const root = repo(t);
  const out = bashAround(root, () => writeFileSync(join(root, "Makefile"), "all:\nclean:\n"));
  assert.equal(out?.decision, "block", JSON.stringify(out));
  assert.match(out.reason, /Gate files changed during this Bash command: Makefile\./);
  assert.match(out.reason, /ask the owner to look/);
});

test("US-QG-07, issue 2554, round 2: a block is printed once: the stored state moves on after it, so the next command with no change is silent", (t) => {
  const root = repo(t);
  assert.equal(
    bashAround(root, () => writeFileSync(join(root, "AGENTS.md"), "new\n"))?.decision,
    "block",
  );
  assert.equal(
    bashAround(root, () => {}),
    null,
  );
});

test("US-QG-07, issue 2554, round 2: a subagent is told to revert the change and to report it, since a deny cannot undo a write", (t) => {
  const root = repo(t);
  const out = bashAround(root, () => writeFileSync(join(root, "Makefile"), "x\n"), {
    agent_id: "a1",
  });
  assert.equal(out?.decision, "block");
  assert.match(out.reason, /Subagents do not edit gate files: revert the change now/);
  assert.match(out.reason, /ticket lead/);
});

test("US-QG-07, issue 2554, round 2: an edit that went through is not a Bash change: its state is stored at once", (t) => {
  const root = repo(t);
  call("guard-bash", root);
  writeFileSync(join(root, "Makefile"), "all:\nclean:\n");
  call("after-edit", root, {
    command: undefined,
    extra: {
      tool_name: "Edit",
      tool_input: { file_path: join(root, "Makefile") },
    },
  });
  assert.equal(call("after-bash", root), null);
});

test("US-QG-07, issue 2554, round 2: a touch that keeps the content, and a change of a gate test, block nothing", (t) => {
  const root = repo(t);
  assert.equal(
    bashAround(root, () => utimesSync(join(root, "Makefile"), new Date(1000), new Date(1000))),
    null,
  );
  assert.equal(
    bashAround(root, () =>
      writeFileSync(join(root, ".claude/hooks/rules.test.mjs"), "// changed\n"),
    ),
    null,
  );
});

test("US-QG-07, issue 2554, round 2: a stored state that cannot be verified blocks once, and the change is logged as blocked by after-bash", (t) => {
  const root = repo(t);
  call("guard-bash", root);
  const gitDir = execFileSync("git", ["rev-parse", "--absolute-git-dir"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  writeFileSync(join(gitDir, FINGERPRINT_FILE), "{}\n");
  const out = call("after-bash", root);
  assert.equal(out?.decision, "block");
  assert.match(out.reason, /The stored state of the gate files cannot be verified/);
  assert.equal(
    call("after-bash", root),
    null,
    "the state is stored again, so the next check is silent",
  );
  const common = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  // No change is named, but the unverified state is logged as blocked, so the owner can see it (round 3: never silent).
  const lines = readFileSync(join(common, LOG_FILE), "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
  assert.ok(lines.some((l) => l.decision === "blocked" && l.file === "(the stored state)"));
});

test("US-QG-07, issue 2554, round 2: a change that the denylist also refuses is still logged as blocked after the command", (t) => {
  const root = repo(t);
  call("guard-bash", root);
  writeFileSync(join(root, "Makefile"), "all:\nx\n");
  call("after-bash", root);
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
      (l) => l.decision === "blocked" && l.source === "after-bash" && l.file === "Makefile",
    ),
  );
});
