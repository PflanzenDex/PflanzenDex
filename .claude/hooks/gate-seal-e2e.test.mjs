// End-to-end tests of the seals (US-QG-07, issue 2554, round 2): a confirmation record written without the key asks, and a log line
// written without the key shows as UNSIGNED in `make gate-log`. Real git, temporary repositories, each removed when its test ends.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIRMATIONS_FILE } from "./gate-confirmations.mjs";
import { LOG_FILE } from "./gate-log.mjs";

const HOOK = fileURLToPath(new URL("./run.mjs", import.meta.url));
const LOG_CLI = fileURLToPath(new URL("./gate-log.mjs", import.meta.url));
const ENV = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")),
);

function repo(t) {
  const root = mkdtempSync(join(tmpdir(), "gate-seal-e2e-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (args) =>
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@x.invalid", ...args], {
      cwd: root,
      env: ENV,
      stdio: "ignore",
    });
  git(["init", "-q", "-b", "fix/x"]);
  mkdirSync(join(root, ".githooks"), { recursive: true });
  writeFileSync(join(root, "Makefile"), "all:\n");
  writeFileSync(join(root, ".githooks/pre-commit"), "#!/bin/sh\n");
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "init"]);
  return root;
}

const edit = (root, file) => {
  const result = spawnSync("node", [HOOK, "guard-edit"], {
    input: JSON.stringify({
      tool_name: "Edit",
      cwd: root,
      tool_input: { file_path: join(root, file) },
    }),
    env: { ...ENV, CLAUDE_PROJECT_DIR: root },
    encoding: "utf8",
  });
  assert.equal(result.stderr, "");
  return result.stdout === "" ? null : JSON.parse(result.stdout).hookSpecificOutput;
};

test("US-QG-07, issue 2554, round 2: a confirmation record written without the key does not allow the file: the edit is asked", (t) => {
  const root = repo(t);
  const gitDir = execFileSync("git", ["rev-parse", "--absolute-git-dir"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  // The forged record: the right shape and the right branch, and no MAC.
  writeFileSync(
    join(gitDir, CONFIRMATIONS_FILE),
    JSON.stringify({ "refs/heads/fix/x": ["Makefile"] }),
  );
  assert.equal(edit(root, "Makefile")?.permissionDecision, "ask", "a forged allow is no allow");
});

test("US-QG-07, issue 2554, round 2: a log line written without the key shows as UNSIGNED in make gate-log, and a signed line as ok", (t) => {
  const root = repo(t);
  const common = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  assert.equal(
    edit(root, "Makefile")?.permissionDecision,
    "ask",
    "a real decision writes a signed line",
  );
  appendFileSync(
    join(common, LOG_FILE),
    `${JSON.stringify({ time: "t", branch: "fix/x", file: "Makefile", decision: "allowed", source: "gate-allow", actor: null, mode: null, agent: null })}\n`,
  );
  const shown = spawnSync("node", [LOG_CLI], { cwd: root, env: ENV, encoding: "utf8" }).stdout;
  assert.match(shown, /ok\s+ask\s+guard-edit/);
  assert.match(shown, /UNSIGNED\s+allowed\s+gate-allow/);
});
