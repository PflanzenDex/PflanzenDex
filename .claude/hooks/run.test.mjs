// Tests for the hook entry run.mjs (US-QG-09, owner decision d-138 point 3): the edit hook asks before an edit that adds a
// layout manifest or raises its expect, as make merge does, and it asks nothing for a limit that the merge base gave the
// folder (d-139). The hook runs as Claude Code runs it: the request on stdin, the answer on stdout, in a fixture repository.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const HOOK = fileURLToPath(new URL("./run.mjs", import.meta.url));
const CONFIG = `export default {
  maxUnits: 8,
  dirs: [{ path: "app/x", maxUnits: 6 }],
};
`;
const manifest = (expect) =>
  `---\ntopic: Plant layer\nwhy: one feature\nexpect: ${expect}\n---\n# Plant layer\n`;

const git = (cwd, ...args) =>
  execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], {
    cwd,
    stdio: "ignore",
  });

// A repository whose origin/dev is its only commit, so the merge base of the working tree is that commit.
function repoWith(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "run-hook-"));
  git(dir, "init", "-q");
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), text);
  }
  git(dir, "add", "-A");
  git(dir, "commit", "-qm", "dev");
  git(dir, "update-ref", "refs/remotes/origin/dev", "HEAD");
  return dir;
}

// The answer of guard-edit to one edit: the permission decision and its reason, or null when the hook asks nothing.
function guardEdit(dir, toolName, toolInput) {
  const result = spawnSync(process.execPath, [HOOK, "guard-edit"], {
    input: JSON.stringify({ cwd: dir, tool_name: toolName, tool_input: toolInput }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout === "" ? null : JSON.parse(result.stdout).hookSpecificOutput;
}

const writeReadme = (dir, text) =>
  guardEdit(dir, "Write", { file_path: path.join(dir, "app/x/README.md"), content: text });
const editReadme = (dir, oldText, newText) =>
  guardEdit(dir, "Edit", {
    file_path: path.join(dir, "app/x/README.md"),
    old_string: oldText,
    new_string: newText,
  });

test("US-QG-09 (d-139): a README manifest within the limit the merge base gave the folder asks nothing, one above it asks", () => {
  const dir = repoWith({ "app/config/lint/layout.config.mjs": CONFIG, "app/x/index.ts": "" });
  try {
    assert.equal(writeReadme(dir, manifest(7)), null);
    const above = writeReadme(dir, manifest(8));
    assert.equal(above.permissionDecision, "ask");
    assert.match(
      above.permissionDecisionReason,
      /^app\/x\/README\.md is a layout manifest and this change grows it: a new manifest, expect 8\./,
    );
    assert.match(above.permissionDecisionReason, /US-QG-09/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("US-QG-09 (d-138): a new manifest in a folder without a per-path rule asks, and a README without frontmatter asks nothing", () => {
  const dir = repoWith({ "app/config/lint/layout.config.mjs": CONFIG, "app/y/index.ts": "" });
  try {
    assert.equal(writeReadme(dir, "# x\n"), null, "no manifest, no question");
    const asked = guardEdit(dir, "Write", {
      file_path: path.join(dir, "app/y/README.md"),
      content: manifest(7),
    });
    assert.equal(asked.permissionDecision, "ask");
    assert.match(asked.permissionDecisionReason, /a new manifest, expect 7/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("US-QG-09 (d-138): raising the expect of a manifest on dev asks, lowering it does not", () => {
  const dir = repoWith({
    "app/config/lint/layout.config.mjs": CONFIG,
    "app/x/README.md": manifest(11),
  });
  try {
    const raised = editReadme(dir, "expect: 11", "expect: 12");
    assert.equal(raised.permissionDecision, "ask");
    assert.match(raised.permissionDecisionReason, /expect rose from 11 to 12/);
    assert.equal(editReadme(dir, "expect: 11", "expect: 10"), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("US-QG-09 (d-139): a README made on this branch counts its unit as new, judged against the merge base", () => {
  const dir = repoWith({ "app/config/lint/layout.config.mjs": CONFIG, "app/x/index.ts": "" });
  try {
    fs.writeFileSync(path.join(dir, "app/x/README.md"), "# x\n");
    assert.equal(writeReadme(dir, manifest(7)), null);
    assert.equal(writeReadme(dir, manifest(8)).permissionDecision, "ask");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("US-QG-09 (d-138): without a merge base the hook cannot read the carried limit, so a new manifest asks (fail closed)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "run-hook-"));
  try {
    assert.equal(writeReadme(dir, manifest(7)).permissionDecision, "ask");
    assert.equal(writeReadme(dir, "# x\n"), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("US-QG-09 (d-138): an edit of a manifest that cannot be placed exactly on the file asks (fail closed)", () => {
  const dir = repoWith({
    "app/config/lint/layout.config.mjs": CONFIG,
    "app/x/README.md": manifest(11),
  });
  try {
    const asked = editReadme(dir, "expect: 99", "expect: 12");
    assert.equal(asked.permissionDecision, "ask");
    assert.match(asked.permissionDecisionReason, /cannot be placed exactly/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
