// Tests for the agent hook rules (US-QG-07, US-DEV-02).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  isCodePath,
  isGateFile,
  judgeCommand,
  prettierCanFormat,
  ranGates,
  stripText,
} from "./rules.mjs";

const decision = (cmd) => judgeCommand(cmd)?.decision ?? "none";

test("US-QG-07: gate configs need a human confirmation, ordinary code does not", () => {
  for (const f of [
    ".github/workflows/ci.yml",
    ".github/rulesets/main-protection.json",
    ".githooks/pre-push",
    ".claude/settings.json",
    "Makefile",
    "app/eslint.config.js",
    "app/knip.json",
    "app/scripts/check-boundaries.mjs",
    "app/packages/db/vitest.config.ts",
  ]) {
    assert.equal(isGateFile(f), true, f);
  }
  for (const f of ["app/packages/core/src/index.ts", "Docs/PRODUKT-SPECS/02-Bestand.md", "app/README.md"]) {
    assert.equal(isGateFile(f), false, f);
  }
});

test("US-QG-07: skipping hooks, merging and pushing to protected branches are denied", () => {
  for (const cmd of [
    "git commit --no-verify -m x",
    "git commit -nm wip",
    "git push --no-verify",
    "gh pr merge 12 --squash",
    "git push origin main",
    "git push origin HEAD:dev",
    "git push -u origin dev",
    "git push --force origin feat/x",
    "git push -f",
    "git config core.hooksPath /dev/null",
  ]) {
    assert.equal(decision(cmd), "deny", cmd);
  }
});

test("US-QG-07: normal work and own feature branches are not blocked", () => {
  for (const cmd of [
    "git push -u origin feat/dev-02-git-hooks",
    "git push origin dev-tools",
    "git push --force-with-lease origin feat/x",
    "git commit -m 'feat(pha): derive care phase'",
    "git commit -am wip",
    "make ci",
    "gh pr create --base dev --title x",
    "gh api repos/PflanzenDex/PflanzenDex/rulesets",
  ]) {
    assert.equal(decision(cmd), "none", cmd);
  }
});

test("US-QG-07: commit messages and PR bodies that only mention commands are not judged", () => {
  const body = "gh pr create --body-file - <<'EOF'\nNever run git push origin main or --no-verify.\nEOF";
  assert.equal(decision(body), "none");
  assert.equal(decision('git commit -m "docs: explain why --no-verify is banned"'), "none");
  assert.equal(stripText("echo 'a' \"b\""), "echo '' \"\"");
});

test("US-QG-07: changing protection settings or releasing by hand needs confirmation", () => {
  for (const cmd of [
    "gh api -X PUT repos/o/r/rulesets/1 --input x.json",
    "gh api --method DELETE repos/o/r/branches/main/protection",
    "gh repo edit --visibility private",
    "gh release create v1.0.0",
    "git push origin v0.2.0",
  ]) {
    assert.equal(decision(cmd), "ask", cmd);
  }
});

test("US-DEV-02: formatting, code paths and gate runs are recognized", () => {
  assert.equal(prettierCanFormat("app/packages/core/src/a.ts"), true);
  assert.equal(prettierCanFormat("app/node_modules/x/a.js"), false);
  assert.equal(prettierCanFormat("Docs/ROADMAP.md"), false);
  assert.equal(isCodePath("app/packages/web/src/App.tsx"), true);
  assert.equal(isCodePath("Docs/ROADMAP.md"), false);
  assert.equal(ranGates("make ci"), true);
  assert.equal(ranGates("make gates 2>&1 | tail"), true);
  assert.equal(ranGates("make test"), false);
});

test("US-DEV-02: the guard hook answers in the Claude Code PreToolUse format", () => {
  const hook = fileURLToPath(new URL("./run.mjs", import.meta.url));
  const out = execFileSync("node", [hook, "guard-bash"], {
    input: JSON.stringify({ tool_input: { command: "gh pr merge 3" } }),
    encoding: "utf8",
  });
  const parsed = JSON.parse(out);
  assert.equal(parsed.hookSpecificOutput.hookEventName, "PreToolUse");
  assert.equal(parsed.hookSpecificOutput.permissionDecision, "deny");
  const silent = execFileSync("node", [hook, "guard-bash"], {
    input: JSON.stringify({ tool_input: { command: "make ci" } }),
    encoding: "utf8",
  });
  assert.equal(silent, "");
});
