// Tests for the agent hook rules (US-QG-07, US-DEV-02).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { BASELINE_FORMATS, isBaselineFile } from "./baseline-growth.mjs";
import {
  asksBeforeEdit,
  isCodePath,
  isGateFile,
  isMigrationFile,
  judgeCommand,
  prettierCanFormat,
  ranGates,
  recordWriteRefusal,
  stripText,
} from "./rules.mjs";

// The place the rules below are judged in: a linked worktree of /repo, where reset and clean are allowed (US-QG-07).
const WORKTREE = { cwd: "/repo/.worktrees/x", main: "/repo", linked: ["/repo/.worktrees/x"] };
const decision = (cmd) => judgeCommand(cmd, WORKTREE)?.decision ?? "none";

test("US-QG-07: reset and clean are denied in the main checkout, asked in a worktree and denied when the place is unknown", () => {
  const MAIN_CHECKOUT = { cwd: "/repo", main: "/repo", linked: ["/repo/.worktrees/x"] };
  const verdict = judgeCommand("git clean -fd", MAIN_CHECKOUT);
  assert.equal(verdict.decision, "deny");
  assert.match(verdict.reason, /main checkout/);
  assert.equal(judgeCommand("git reset --hard", MAIN_CHECKOUT).decision, "deny");
  assert.equal(decision("git reset --hard"), "ask");
  assert.equal(judgeCommand("git reset --hard").decision, "deny");
  assert.equal(judgeCommand("git status"), null);
});

test("US-QG-07: gate configs need a human confirmation, ordinary code does not", () => {
  for (const f of [
    ".github/workflows/ci.yml",
    ".github/rulesets/main-protection.json",
    ".githooks/pre-push",
    ".claude/settings.json",
    "Makefile",
    "tools/lint/gitleaks.sh",
    "tools/repo/rulesets-apply.sh",
    "app/eslint.config.js",
    "app/config/lint/knip.json",
    "app/tools/check/code/check-boundaries.mjs",
    "app/packages/db/vitest.config.ts",
  ]) {
    assert.equal(isGateFile(f), true, f);
  }
  for (const f of [
    "tools/repo/pr-ready.sh",
    "app/packages/core/src/index.ts",
    "docs/specs/product/02-collection.md",
    "docs/guides/reference/app.md",
  ]) {
    assert.equal(isGateFile(f), false, f);
  }
});

const GATE_LISTS = [
  "coverage-thresholds.json",
  "quality-limits.json",
  "audit-allowlist.json",
  "conformance-allowlist.json",
];

test("US-QG-07: each threshold and exception list in app/config/gates is a gate file", () => {
  for (const f of GATE_LISTS) {
    assert.equal(isGateFile(`app/config/gates/${f}`), true, f);
  }
});

test("US-QG-07: baselines are not gate files by path, so a shrink needs no human; each file has a growth format", () => {
  const baselines = readdirSync(new URL("../../app/config/gates/baselines/", import.meta.url)).sort();
  assert.ok(baselines.length > 0, "the baseline folder has files");
  assert.deepEqual(baselines, Object.keys(BASELINE_FORMATS).sort(), "each file has a format and each format a file");
  for (const f of baselines) {
    assert.equal(isGateFile(`app/config/gates/baselines/${f}`), false, f);
    assert.equal(isBaselineFile(`app/config/gates/baselines/${f}`), true, f);
  }
});

test("US-QG-07: an agent edit to a threshold or exception list asks a human; an identical rewrite of a baseline does not", (t) => {
  const hook = fileURLToPath(new URL("./run.mjs", import.meta.url));
  const root = fileURLToPath(new URL("../..", import.meta.url));
  const guard = (dir, file_path, extra = {}) =>
    execFileSync("node", [hook, "guard-edit"], {
      input: JSON.stringify({ tool_input: { file_path, ...extra } }),
      env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
      encoding: "utf8",
    });
  // Every question writes its snapshot (claude-gate-plan-asked.json) into the git directory of the project it is asked in.
  // The gate lists are asked in a temporary repository, which goes again, so this worktree's git directory gets no file from
  // the test (issue 1636: the last list of the loop used to stay there).
  const project = mkdtempSync(join(tmpdir(), "gate-question-"));
  t.after(() => rmSync(project, { recursive: true, force: true }));
  execFileSync("git", ["init", "-q", project], { stdio: "ignore" });
  mkdirSync(join(project, "app/config/gates"), { recursive: true });
  for (const f of GATE_LISTS) {
    const file = join(project, "app/config/gates", f);
    writeFileSync(file, "{}\n");
    const out = JSON.parse(guard(project, file));
    assert.equal(out.hookSpecificOutput.permissionDecision, "ask", f);
  }
  // A baseline edit that changes nothing passes; it is read only, so it writes nothing.
  const baseline = `${root}/app/config/gates/baselines/ui-text-baseline.json`;
  assert.equal(guard(root, baseline, { content: readFileSync(baseline, "utf8") }), "");
});

// A small baseline with unique counts, so that each old_string below occurs exactly once.
const UI_TEXT = `{
  "maxTotal": 10,
  "entries": [
    { "file": "app/packages/web/src/a.tsx", "count": 6 },
    { "file": "app/packages/web/src/b.tsx", "count": 4 }
  ]
}
`;

/** A temporary project with one baseline file; the hook reads it from disk (US-QG-07). */
function baselineProject(t) {
  const root = mkdtempSync(join(tmpdir(), "baseline-hook-"));
  // The folder goes again, also when an assertion fails (#1297).
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const folder = join(root, "app/config/gates/baselines");
  mkdirSync(folder, { recursive: true });
  const file = join(folder, "ui-text-baseline.json");
  writeFileSync(file, UI_TEXT);
  const hook = fileURLToPath(new URL("./run.mjs", import.meta.url));
  // The hook swallows its own errors (exit 0, message on stderr): a silent failure must not pass as "no question".
  const guard = (tool_input) => {
    const result = spawnSync("node", [hook, "guard-edit"], {
      input: JSON.stringify({ tool_input }),
      env: { ...process.env, CLAUDE_PROJECT_DIR: root },
      encoding: "utf8",
    });
    assert.equal(result.stderr, "", `the hook reports an error for ${JSON.stringify(tool_input)}`);
    assert.equal(result.status, 0);
    return result.stdout;
  };
  return {
    file,
    /** The hook asks a human, and its reason matches. */
    asks(tool_input, reason) {
      const out = JSON.parse(guard(tool_input));
      assert.equal(out.hookSpecificOutput.permissionDecision, "ask", JSON.stringify(tool_input));
      assert.match(out.hookSpecificOutput.permissionDecisionReason, reason);
    },
    /** The hook says nothing: the edit passes without a question. */
    passes(tool_input) {
      assert.equal(guard(tool_input), "", JSON.stringify(tool_input));
    },
  };
}

test("US-QG-07: an Edit that raises a count, adds an entry or raises maxTotal asks a human, and names the file and the reason", (t) => {
  const project = baselineProject(t);
  const file_path = project.file;
  project.asks({ file_path, old_string: '"count": 6', new_string: '"count": 7' }, /ui-text-baseline\.json.*a\.tsx: count rose from 6 to 7/);
  project.asks(
    {
      file_path,
      old_string: '{ "file": "app/packages/web/src/b.tsx", "count": 4 }',
      new_string: '{ "file": "app/packages/web/src/b.tsx", "count": 4 },\n    { "file": "app/packages/web/src/c.tsx", "count": 1 }',
    },
    /new entry .*c\.tsx/,
  );
  project.asks({ file_path, old_string: '"maxTotal": 10', new_string: '"maxTotal": 11' }, /maxTotal raised from 10 to 11/);
});

test("US-QG-07: an Edit that only lowers a count, lowers maxTotal or removes an entry passes without asking", (t) => {
  const project = baselineProject(t);
  const file_path = project.file;
  project.passes({ file_path, old_string: '"count": 6', new_string: '"count": 5' });
  project.passes({ file_path, old_string: '"maxTotal": 10', new_string: '"maxTotal": 9' });
  project.passes({
    file_path,
    old_string: ',\n    { "file": "app/packages/web/src/b.tsx", "count": 4 }',
    new_string: "",
  });
});

test("US-QG-07: a Write and a MultiEdit are judged by the text they leave; an edit that cannot be placed exactly or a text that does not parse asks", (t) => {
  const project = baselineProject(t);
  const file_path = project.file;
  const shrunk = JSON.stringify({ maxTotal: 6, entries: [{ file: "app/packages/web/src/a.tsx", count: 6 }] });
  project.passes({ file_path, content: shrunk });
  project.asks(
    { file_path, content: JSON.stringify({ maxTotal: 10, entries: [{ file: "app/packages/web/src/a.tsx", count: 6 }, { file: "app/packages/web/src/z.tsx", count: 1 }] }) },
    /new entry .*z\.tsx/,
  );
  project.passes({
    file_path,
    edits: [
      { old_string: '"count": 6', new_string: '"count": 5' },
      { old_string: '"maxTotal": 10', new_string: '"maxTotal": 9' },
    ],
  });
  project.asks({ file_path, content: "{" }, /does not parse/);
  project.asks({ file_path, old_string: '"count": 99', new_string: '"count": 100' }, /cannot be placed exactly/);
  project.asks({ file_path, old_string: '"file": "app/packages/web/src/', new_string: "x" }, /cannot be placed exactly/);
});

test("US-QG-07: a new baseline file asks a human, whatever it contains, and so does an edit of a file that does not exist", (t) => {
  const project = baselineProject(t);
  const folder = join(project.file, "..");
  project.asks({ file_path: join(folder, "new-thing-baseline.json"), content: "{}" }, /new baseline file/);
  project.asks({ file_path: join(folder, "missing-baseline.json"), old_string: "a", new_string: "b" }, /new baseline file/);
});

test("US-QG-07: the moved check scripts, their libraries and the layout config stay gate files (FR-QG-21)", () => {
  for (const f of [
    "app/tools/check/docs/check-links.mjs",
    "app/tools/check/code/check-boundaries.mjs",
    "app/tools/check/code/layout/layout-rules.mjs",
    "app/tools/check/code/layout/layout-baseline.mjs",
    "app/tools/check/quality/coverage/coverage-config.mjs",
    "app/tools/check/code/conformance/conformance-rules.mjs",
    "app/tools/workflow/merge-pr.mjs",
    "app/tools/workflow/merge-pr.test.mjs",
    "app/config/lint/layout.config.mjs",
    "app/config/project/issue-taxonomy.json",
  ]) {
    assert.equal(isGateFile(f), true, f);
  }
  for (const f of [
    "app/tools/check/docs/check-links.test.mjs",
    "app/tools/check/code/layout/layout-rules.test.mjs",
    "app/tools/workflow/claim/claim.mjs",
    "app/tools/workflow/board.mjs",
    "app/tools/dev/repo-stats.mjs",
    "app/config/gates/baselines/layout-baseline.json",
  ]) {
    assert.equal(isGateFile(f), false, f);
  }
});

test("US-QG-07: the display tolerances (one-screen baseline and judge, a11y findings) are gate files; their neighbours are not (FR-QG-17)", () => {
  for (const f of [
    "app/packages/e2e/support/display/one-screen/baseline.ts",
    "app/packages/e2e/support/display/one-screen/judge.ts",
    "app/packages/e2e/support/display/a11y/findings.ts",
    "app/packages/e2e/support/display/a11y/axe-findings.ts",
  ]) {
    assert.equal(isGateFile(f), true, f);
  }
  for (const f of [
    "app/packages/e2e/support/display/a11y/baseline-cli.ts",
    "app/packages/e2e/support/display/screens.json",
    "app/packages/e2e/support/display/one-screen/register.ts",
  ]) {
    assert.equal(isGateFile(f), false, f);
  }
});

test("US-QG-07: the news logic behind the changelog check is a gate file; its types, its tests and the news display beside it are not", () => {
  assert.equal(isGateFile("app/packages/web/src/app/destinations/account-area/whats-new/news-lines.mjs"), true);
  for (const f of [
    "app/packages/web/src/app/destinations/account-area/whats-new/news-lines.d.mts",
    "app/packages/web/src/app/destinations/account-area/whats-new/news-lines.test.ts",
    "app/packages/web/src/app/destinations/account-area/whats-new/whats-new.ts",
  ]) {
    assert.equal(isGateFile(f), false, f);
  }
});

test("US-QG-07: a gate test stays a gate file for make merge but asks no question in the hook; the code it tests still asks", () => {
  for (const f of [
    ".claude/hooks/rules.test.mjs",
    ".claude/hooks/worktree.test.mjs",
    ".claude/hooks/any.selftest.mjs",
    "app/tools/workflow/merge-pr.test.mjs",
  ]) {
    assert.equal(isGateFile(f), true, f);
    assert.equal(asksBeforeEdit(f), false, f);
  }
  for (const f of [
    ".claude/hooks/rules.mjs",
    ".claude/hooks/rules.test.mjs.bak",
    "app/tools/workflow/merge-pr.mjs",
    "app/config/gates/quality-limits.json",
    "Makefile",
  ]) {
    assert.equal(asksBeforeEdit(f), true, f);
  }
  assert.equal(asksBeforeEdit("app/packages/core/src/index.test.ts"), false);
});

test("US-QG-07: a shell command that names a gate record is refused, writes and reads alike; make gate-plan and ordinary commands are not", () => {
  for (const cmd of [
    `echo '{}' > "$(git rev-parse --git-dir)/claude-gate-confirmations.json"`,
    "echo '{}' >> .git/claude-gate-plan.json",
    "echo '{}' | tee .git/claude-gate-plan-asked.json",
    "cp /tmp/x.json .git/claude-gate-confirmations.json",
    "mv /tmp/x.json .git/claude-gate-plan.json",
    "sed -i 's/a/b/' .git/claude-gate-plan.json",
    `node -e "require('fs').writeFileSync('.git/claude-gate-confirmations.json', '{}')"`,
    `python3 -c "open('.git/claude-gate-plan.json', 'w').write('{}')"`,
    "cat .git/claude-gate-confirmations.json",
    "cp /tmp/x.json .git/claude-gate-*",
    "echo '{}' > .git/claude-gates-fingerprint",
    'echo x > .git/claude-"gate"-plan.json',
  ]) {
    assert.equal(decision(cmd), "deny", cmd);
  }
  assert.match(judgeCommand("cat .git/claude-gate-plan.json", WORKTREE).reason, /claude-gate\* files/);
  for (const cmd of [
    'make gate-plan FILES=".claude/hooks/rules.mjs .claude/hooks/rules.test.mjs"',
    "make gate-plan FILES=Makefile",
    "node .claude/hooks/gate-plan.mjs",
    "git status",
    "make ci",
    "npm run test:tools",
  ]) {
    assert.equal(decision(cmd), "none", cmd);
  }
});

test("US-QG-07: a Write or Edit whose new text names a record is refused outside .claude/hooks, whatever the file type, and passes inside it", () => {
  const named = "echo '{}' > \"$(git rev-parse --git-dir)/claude-gate-plan.json\"\n";
  for (const file of ["scripts/run.mjs", "scripts/run.txt", "docs/notes.md", "../../tmp/outside.mjs"]) {
    assert.match(recordWriteRefusal(file, [named]), /^This text names a claude-gate\* file/, file);
  }
  // Quotes and backslashes are dropped, as for commands.
  assert.notEqual(recordWriteRefusal("scripts/run.mjs", ['claude-"gate"-plan.json']), null);
  assert.notEqual(recordWriteRefusal("scripts/run.mjs", ["claude\\-gate-plan.json"]), null);
  // One new text that names a record is enough, also among the edits of a MultiEdit.
  assert.notEqual(recordWriteRefusal("scripts/run.mjs", ["export {};", named]), null);
  // The hook code and its tests may name the records.
  assert.equal(recordWriteRefusal(".claude/hooks/run.mjs", [named]), null);
  assert.equal(recordWriteRefusal(".claude/hooks/rules.test.mjs", [named]), null);
  // Ordinary text passes, and so does a doc that names the records in the glob form.
  assert.equal(recordWriteRefusal("scripts/run.mjs", ["export const x = 1;\n"]), null);
  assert.equal(recordWriteRefusal("docs/notes.md", ["The records are `claude-gate*` files.\n"]), null);
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

test("FR-DEV-10: a bare gh issue create is denied, make issue and reading issues are not; label changes need the owner", () => {
  assert.equal(decision("gh issue create --title x --body-file b.md"), "deny");
  assert.equal(decision("cd app && gh issue create -t x"), "deny");
  for (const cmd of [
    'make issue TYPE=bug EPIC=QS PRIORITY=P3 TITLE="x" BODY=b.md',
    "gh issue view 1222",
    "gh issue comment 1222 --body x",
    "gh label list",
    'gh pr create --body "use gh issue create never"',
  ]) {
    assert.equal(decision(cmd), "none", cmd);
  }
  for (const cmd of [
    "gh label create epic:X",
    "gh label edit bug --color 000000",
    "gh label delete old",
  ]) {
    assert.equal(decision(cmd), "ask", cmd);
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
  const body =
    "gh pr create --body-file - <<'EOF'\nNever run git push origin main or --no-verify.\nEOF";
  assert.equal(decision(body), "none");
  assert.equal(
    decision('git commit -m "docs: explain why --no-verify is banned"'),
    "none",
  );
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
  assert.equal(prettierCanFormat("docs/guides/roadmap.md"), false);
  assert.equal(isCodePath("app/packages/web/src/App.tsx"), true);
  assert.equal(isCodePath("docs/guides/roadmap.md"), false);
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
  for (const cmd of [
    "npm install left-pad",
    "npm i -D vitest",
    "npm add zod -w app/packages/core",
    "cd app && npm install --save-dev x",
    "pnpm add y",
  ]) {
    assert.equal(decision(cmd), "ask", cmd);
  }
  for (const cmd of [
    "npm ci",
    "npm install",
    "npm install --no-audit",
    "npm run test",
    "npm i && make ci",
    'git commit -m "chore: npm install foo"',
  ]) {
    assert.equal(decision(cmd), "none", cmd);
  }
});

test("US-QG-07: rm -rf outside throwaway directories needs confirmation", () => {
  for (const cmd of [
    "rm -rf /",
    "rm -rf ~",
    "rm -rf app",
    "rm -rf ../other",
    "rm -rf *",
    "rm -fr app/packages/core/src",
    "rm -r $HOME/x",
    "make ci && rm -rf Docs",
  ]) {
    assert.equal(decision(cmd), "ask", cmd);
  }
  for (const cmd of [
    "rm -rf node_modules",
    "rm -rf app/node_modules app/packages/web/dist",
    "rm -rf ./coverage .cache",
    "rm -f file.txt",
    "rm -rf app/packages/*/dist",
  ]) {
    assert.equal(decision(cmd), "none", cmd);
  }
});

test("US-QG-07: commands that discard uncommitted work need confirmation", () => {
  for (const cmd of [
    "git reset --hard",
    "git reset --hard origin/dev",
    "git clean -fd",
    "git clean -fdx",
    "git clean --force",
    "git checkout -- .",
    "git checkout .",
    "git restore .",
    "git restore --worktree .",
  ]) {
    assert.equal(decision(cmd), "ask", cmd);
  }
  for (const cmd of [
    "git reset --soft HEAD~1",
    "git reset HEAD file",
    "git clean -n",
    "git checkout feat/x",
    "git checkout -b feat/y",
    "git restore --staged .",
    "git restore file.ts",
    "git status",
  ]) {
    assert.equal(decision(cmd), "none", cmd);
  }
});

test("US-QG-07: only existing migration files are protected by the edit guard", () => {
  assert.equal(
    isMigrationFile("app/packages/db/migrations/0004_lichtzonen_standorte.sql"),
    true,
  );
  assert.equal(isMigrationFile("app/packages/db/src/migrate.ts"), false);
  assert.equal(isMigrationFile("app/packages/db/migrations/README.md"), false);
  const hook = fileURLToPath(new URL("./run.mjs", import.meta.url));
  const root = fileURLToPath(new URL("../..", import.meta.url));
  const guard = (file_path) =>
    execFileSync("node", [hook, "guard-edit"], {
      input: JSON.stringify({ tool_input: { file_path } }),
      env: { ...process.env, CLAUDE_PROJECT_DIR: root },
      encoding: "utf8",
    });
  const existing = JSON.parse(
    guard(`${root}/app/packages/db/migrations/0001_mandantengrundlage.sql`),
  );
  assert.equal(existing.hookSpecificOutput.permissionDecision, "deny");
  assert.equal(
    guard(`${root}/app/packages/db/migrations/9999_new_one.sql`),
    "",
  );
});
