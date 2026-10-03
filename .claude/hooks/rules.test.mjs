// Tests for the agent hook rules (US-QG-07, US-DEV-02).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  isCodePath,
  isGateFile,
  isMigrationFile,
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

test("US-QG-07: adding dependencies needs confirmation, installing the lockfile does not", () => {
  for (const cmd of ["npm install left-pad", "npm i -D vitest", "npm add zod -w app/packages/core", "cd app && npm install --save-dev x", "pnpm add y"]) {
    assert.equal(decision(cmd), "ask", cmd);
  }
  for (const cmd of ["npm ci", "npm install", "npm install --no-audit", "npm run test", "npm i && make ci", 'git commit -m "chore: npm install foo"']) {
    assert.equal(decision(cmd), "none", cmd);
  }
});

test("US-QG-07: rm -rf outside throwaway directories needs confirmation", () => {
  for (const cmd of ["rm -rf /", "rm -rf ~", "rm -rf app", "rm -rf ../other", "rm -rf *", "rm -fr app/packages/core/src", "rm -r $HOME/x", "make ci && rm -rf Docs"]) {
    assert.equal(decision(cmd), "ask", cmd);
  }
  for (const cmd of ["rm -rf node_modules", "rm -rf app/node_modules app/packages/web/dist", "rm -rf ./coverage .cache", "rm -f file.txt", "rm -rf app/packages/*/dist"]) {
    assert.equal(decision(cmd), "none", cmd);
  }
});

test("US-QG-07: commands that discard uncommitted work need confirmation", () => {
  for (const cmd of ["git reset --hard", "git reset --hard origin/dev", "git clean -fd", "git clean -fdx", "git clean --force", "git checkout -- .", "git checkout .", "git restore .", "git restore --worktree ."]) {
    assert.equal(decision(cmd), "ask", cmd);
  }
  for (const cmd of ["git reset --soft HEAD~1", "git reset HEAD file", "git clean -n", "git checkout feat/x", "git checkout -b feat/y", "git restore --staged .", "git restore file.ts", "git status"]) {
    assert.equal(decision(cmd), "none", cmd);
  }
});

test("US-QG-07: only existing migration files are protected by the edit guard", () => {
  assert.equal(isMigrationFile("app/packages/db/migrations/0004_lichtzonen_standorte.sql"), true);
  assert.equal(isMigrationFile("app/packages/db/src/migrate.ts"), false);
  assert.equal(isMigrationFile("app/packages/db/migrations/README.md"), false);
  const hook = fileURLToPath(new URL("./run.mjs", import.meta.url));
  const root = fileURLToPath(new URL("../..", import.meta.url));
  const guard = (file_path) =>
    execFileSync("node", [hook, "guard-edit"], { input: JSON.stringify({ tool_input: { file_path } }), env: { ...process.env, CLAUDE_PROJECT_DIR: root }, encoding: "utf8" });
  const existing = JSON.parse(guard(`${root}/app/packages/db/migrations/0001_mandantengrundlage.sql`));
  assert.equal(existing.hookSpecificOutput.permissionDecision, "deny");
  assert.equal(guard(`${root}/app/packages/db/migrations/9999_new_one.sql`), "");
});
