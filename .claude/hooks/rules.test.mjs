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
  ENV_READ_REASON,
  envReadBash,
  envReadRefusal,
  globCanNameSecret,
  isCodePath,
  isGateFile,
  isMigrationFile,
  isSecretEnvPath,
  judgeCommand,
  prettierCanFormat,
  ranGates,
  RECURSIVE_SEARCH_REASON,
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
    ".github/dependabot.yml",
    ".claude/settings.json",
    ".agents/skills/spec-to-tests/SKILL.md",
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
    // Renovate is gone (#2534 replaced it with Dependabot): its path is no gate file any more.
    ".github/renovate.json5",
    ".agents/other/SKILL.md",
    "docs/.agents/skills/x/SKILL.md",
    "tools/repo/pr-ready.sh",
    "app/packages/core/src/index.ts",
    "docs/specs/product/02-collection.md",
    "docs/guides/reference/app.md",
  ]) {
    assert.equal(isGateFile(f), false, f);
  }
});

test("US-QG-07 (issue 2381): the root AGENTS.md is a gate file that asks a human; a nested AGENTS.md and a backup are not", () => {
  assert.equal(isGateFile("AGENTS.md"), true);
  assert.equal(asksBeforeEdit("AGENTS.md"), true);
  assert.equal(isGateFile("docs/AGENTS.md"), false);
  assert.equal(isGateFile("AGENTS.md.bak"), false);
});

test("US-QG-07 (issue 2528): every file under .claude/ is a gate file that asks a human, a gate test under .claude/hooks asks nothing, and a path only next to .claude/ is no gate file", () => {
  for (const f of [
    ".claude/rules/api.md",
    ".claude/agents/implementer.md",
    // A symlink into .agents/skills: the link path under .claude/ is the gate file.
    ".claude/skills/spec-to-tests",
    ".claude/mods/status-panel/hooks/register.tsx",
    ".claude/settings.json",
    ".claude/hooks/rules.mjs",
    // A test of a mod is no gate test (AGENTS.md names the places of gate tests), whatever its extension: it asks.
    ".claude/mods/status-panel/tests/panel.test.tsx",
    ".claude/mods/status-panel/tests/panel.test.ts",
  ]) {
    assert.equal(isGateFile(f), true, f);
    assert.equal(asksBeforeEdit(f), true, f);
  }
  assert.equal(isGateFile(".claude/hooks/rules.test.mjs"), true);
  assert.equal(asksBeforeEdit(".claude/hooks/rules.test.mjs"), false);
  for (const f of ["claude/rules/api.md", "docs/.claude/rules/api.md"]) {
    assert.equal(isGateFile(f), false, f);
    assert.equal(asksBeforeEdit(f), false, f);
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
  const baselines = readdirSync(
    new URL("../../app/config/gates/baselines/", import.meta.url),
  ).sort();
  assert.ok(baselines.length > 0, "the baseline folder has files");
  assert.deepEqual(
    baselines,
    Object.keys(BASELINE_FORMATS).sort(),
    "each file has a format and each format a file",
  );
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
  project.asks(
    { file_path, old_string: '"count": 6', new_string: '"count": 7' },
    /ui-text-baseline\.json.*a\.tsx: count rose from 6 to 7/,
  );
  project.asks(
    {
      file_path,
      old_string: '{ "file": "app/packages/web/src/b.tsx", "count": 4 }',
      new_string:
        '{ "file": "app/packages/web/src/b.tsx", "count": 4 },\n    { "file": "app/packages/web/src/c.tsx", "count": 1 }',
    },
    /new entry .*c\.tsx/,
  );
  project.asks(
    { file_path, old_string: '"maxTotal": 10', new_string: '"maxTotal": 11' },
    /maxTotal raised from 10 to 11/,
  );
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
  const shrunk = JSON.stringify({
    maxTotal: 6,
    entries: [{ file: "app/packages/web/src/a.tsx", count: 6 }],
  });
  project.passes({ file_path, content: shrunk });
  project.asks(
    {
      file_path,
      content: JSON.stringify({
        maxTotal: 10,
        entries: [
          { file: "app/packages/web/src/a.tsx", count: 6 },
          { file: "app/packages/web/src/z.tsx", count: 1 },
        ],
      }),
    },
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
  project.asks(
    { file_path, old_string: '"count": 99', new_string: '"count": 100' },
    /cannot be placed exactly/,
  );
  project.asks(
    { file_path, old_string: '"file": "app/packages/web/src/', new_string: "x" },
    /cannot be placed exactly/,
  );
});

test("US-QG-07: a new baseline file asks a human, whatever it contains, and so does an edit of a file that does not exist", (t) => {
  const project = baselineProject(t);
  const folder = join(project.file, "..");
  project.asks(
    { file_path: join(folder, "new-thing-baseline.json"), content: "{}" },
    /new baseline file/,
  );
  project.asks(
    { file_path: join(folder, "missing-baseline.json"), old_string: "a", new_string: "b" },
    /new baseline file/,
  );
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
    "app/tools/check/docs/check-links.fixtures.json",
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
    "app/packages/e2e/support/display/one-screen/judge.size.ts",
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
  assert.equal(
    isGateFile("app/packages/web/src/app/destinations/account-area/whats-new/news-lines.mjs"),
    true,
  );
  for (const f of [
    "app/packages/web/src/app/destinations/account-area/whats-new/news-lines.d.mts",
    "app/packages/web/src/app/destinations/account-area/whats-new/news-lines.test.ts",
    "app/packages/web/src/app/destinations/account-area/whats-new/whats-new.ts",
  ]) {
    assert.equal(isGateFile(f), false, f);
  }
});

// The gate tests are the tests of gate and check code (owner decision 2026-11-16, issue 2222).
const GATE_TESTS = [
  ".claude/hooks/rules.test.mjs",
  ".claude/hooks/worktree.test.mjs",
  ".claude/hooks/any.selftest.mjs",
  "app/tools/check/x.test.mjs",
  "app/tools/check/docs/check-links.test.mjs",
  "app/tools/check/code/layout/layout-rules.test.mjs",
  "app/tools/check/code/conformance/check-conformance.selftest.mjs",
  "app/tools/check/docs/agents/pr/owner-merge-label.test.mjs",
  "tools/lint/heavy-lock.test.mjs",
  "app/tools/workflow/merge-pr.test.mjs",
  "app/tools/workflow/actions/ci-reuse/ci-reuse.test.mjs",
  "app/tools/workflow/actions/ci-reuse/verdict/quarantine.test.mjs",
  "app/tools/workflow/actions/ci-reuse/gate-review/gate-review.test.mjs",
  "app/tools/workflow/actions/ci-reuse/gate-review/gate-direction.test.mjs",
];

// App tests and the tests of product and process tooling: agents merge them.
const NO_GATE_TESTS = [
  "app/tools/keycloak/theme.test.mjs",
  "app/tools/keycloak/realm.test.mjs",
  "app/packages/api/src/ai/reads/areas.test.ts",
  "app/packages/core/src/index.test.ts",
  "app/packages/web/src/app/destinations/account-area/whats-new/news-lines.test.ts",
  "app/packages/e2e/support/display/one-screen/judge.test.ts",
  "app/tools/dev/repo-stats.test.mjs",
  "app/tools/dev/tests/commitlint.test.mjs",
  "app/tools/layout-fix/layout-fix.test.mjs",
  "app/tools/workflow/board.test.mjs",
  "app/tools/workflow/claim/claim.test.mjs",
  "app/tools/workflow/worktree/worktree-env.test.mjs",
  "app/tools/workflow/actions/issue/issue.test.mjs",
  "app/tools/workflow/actions/deploy/deploy.test.mjs",
  "app/tools/workflow/merge-pr/other.test.mjs",
  "tools/repo/pr-ready.test.mjs",
  "tools/release/data-state-notes.test.mjs",
];

test("US-QG-07: the gate tests are the tests of gate and check code; app tests and product tooling tests are no gate files", () => {
  for (const f of GATE_TESTS) assert.equal(isGateFile(f), true, f);
  for (const f of NO_GATE_TESTS) {
    assert.equal(isGateFile(f), false, f);
    assert.equal(asksBeforeEdit(f), false, f);
  }
});

test("US-QG-07: a gate test stays a gate file for make merge but asks no question in the hook; the code it tests still asks", () => {
  for (const f of GATE_TESTS) {
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

test("US-QG-07, issue 2554: an agent cannot run make gate-allow, and the refusal says that only the owner runs it; make gate-plan passes", () => {
  assert.equal(decision("make gate-allow FILES=Makefile"), "deny");
  assert.match(
    judgeCommand("make gate-allow FILES=Makefile", WORKTREE).reason,
    /^Only the owner runs `gate-allow`/,
  );
  assert.equal(decision("make gate-plan FILES=Makefile"), "none");
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
  assert.match(
    judgeCommand("cat .git/claude-gate-plan.json", WORKTREE).reason,
    /claude-gate\* files/,
  );
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
  for (const file of [
    "scripts/run.mjs",
    "scripts/run.txt",
    "docs/notes.md",
    "../../tmp/outside.mjs",
  ]) {
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
  assert.equal(
    recordWriteRefusal("docs/notes.md", ["The records are `claude-gate*` files.\n"]),
    null,
  );
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

test("US-QG-07: every form that sets or unsets core.hooksPath is denied (issue 1590)", () => {
  for (const cmd of [
    "git config core.hooksPath /dev/null",
    "git config --local core.hooksPath x",
    "git config --global core.hooksPath x",
    "git config --file .git/config core.hooksPath x",
    'git config core.hooksPath "/dev/null"',
    "git config core.HooksPath x",
    "git config --unset core.hooksPath",
    "git config --unset-all core.hooksPath",
    "git config --add core.hooksPath x",
    "git config --replace-all core.hooksPath x",
    "git config --remove-section core",
    "git config --rename-section core other",
    "git config set core.hooksPath x",
    "git config unset core.hooksPath",
    "git config remove-section core",
    "git -C .worktrees/x config core.hooksPath x",
    "git -c core.hooksPath=/dev/null commit -m x",
    "git -c core.hooksPath commit -m x",
    'git -c "core.hooksPath=/dev/null" push',
    "git --config-env=core.hooksPath=HOOKS commit -m x",
    "GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/dev/null git commit -m x",
    "make hooks && git config core.hooksPath /dev/null",
    "echo $(git config core.hooksPath x)",
    'bash -c "git config core.hooksPath /dev/null"',
    "env git config core.hooksPath x",
  ]) {
    assert.equal(decision(cmd), "deny", cmd);
  }
});

test("US-QG-07: reading core.hooksPath passes, and quoted text naming it is not a command (issue 1590)", () => {
  for (const cmd of [
    "git config --get core.hooksPath",
    "git config --get-all core.hooksPath",
    "git config --show-origin --get core.hooksPath",
    "git config core.hooksPath",
    "git config --list",
    "git config -l",
    "git config get core.hooksPath",
    "git config list --show-origin",
    "git -C .worktrees/x config --get core.hooksPath",
    "git -c color.ui=never config --get core.hooksPath",
    "git config --get core.hooksPath || make hooks",
    'git commit -m "docs: never run git config core.hooksPath /dev/null"',
    "git commit -F - <<'EOF'\nfix: the hook refuses\ngit config core.hooksPath /dev/null\nEOF",
    "git config --remove-section color",
    "git config user.name x",
  ]) {
    assert.equal(decision(cmd), "none", cmd);
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
  assert.equal(isMigrationFile("app/packages/db/migrations/0001_baseline.sql"), true);
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
  const existing = JSON.parse(guard(`${root}/app/packages/db/migrations/0001_baseline.sql`));
  assert.equal(existing.hookSpecificOutput.permissionDecision, "deny");
  assert.equal(guard(`${root}/app/packages/db/migrations/9999_new_one.sql`), "");
});

// Secret env files (US-QG-07, issue 2354). The cases are names and command text: no .env file is read or needed.
const refusesEnv = (cmd) => {
  const verdict = judgeCommand(cmd, WORKTREE);
  assert.equal(verdict?.decision, "deny", cmd);
  assert.equal(verdict.reason, ENV_READ_REASON, cmd);
};
const passesEnv = (cmd) => assert.equal(decision(cmd), "none", cmd);

test("US-QG-07: a secret env file is .env or .env.* in any folder; .env.example, .envrc, foo.env and other names are no such file", () => {
  for (const p of [
    ".env",
    ".env.worktree",
    ".env.local",
    "app/config/dev/.env",
    "/abs/path/.env",
    "./.env",
    "../x/.env",
    "app/APP/.ENV.Worktree",
  ]) {
    assert.equal(isSecretEnvPath(p), true, p);
  }
  for (const p of [
    ".env.example",
    "app/config/deploy/.env.example",
    ".envrc",
    "foo.env",
    ".env-local",
    ".environment",
    "docs/env.md",
    "app/.envs/readme.md",
    "",
  ]) {
    assert.equal(isSecretEnvPath(p), false, p);
  }
});

test("US-QG-07: a name pattern that can name a secret env file is secret; a star cannot start a dotfile, so `*env*` and `*.ts` are not", () => {
  for (const g of [
    ".env*",
    ".env.*",
    ".*",
    ".e?v",
    ".[e]nv",
    "[.]env",
    ".env.[a-z]*",
    ".env.exampl[e]",
  ]) {
    assert.equal(globCanNameSecret(g), true, g);
  }
  for (const g of [
    "*.md",
    "*env*",
    "*.ts",
    "**",
    "?env",
    ".envrc*",
    ".gitignore",
    "[!a]nv",
    ".env.example",
  ]) {
    assert.equal(globCanNameSecret(g), false, g);
  }
});

test("US-QG-07: a Read of a secret env file is refused at any depth; .env.example, a doc and the names next to .env pass", () => {
  for (const file_path of [
    ".env",
    ".env.worktree",
    "app/config/dev/.env",
    "/abs/path/.env",
    "./.env.local",
  ]) {
    assert.equal(envReadRefusal("Read", { file_path }), ENV_READ_REASON, file_path);
  }
  for (const file_path of [
    "app/config/deploy/.env.example",
    "docs/guides/operations/parallel-work.md",
    "foo.env",
    ".envrc",
  ]) {
    assert.equal(envReadRefusal("Read", { file_path }), null, file_path);
  }
});

test("US-QG-07: a Grep whose path or glob names a secret env file is refused; a Grep of a doc, of the text .env or of a doc glob passes", () => {
  assert.equal(envReadRefusal("Grep", { path: ".env.worktree" }), ENV_READ_REASON);
  assert.equal(
    envReadRefusal("Grep", { path: "app/config/dev/.env", pattern: "KC" }),
    ENV_READ_REASON,
  );
  assert.equal(envReadRefusal("Grep", { glob: ".env*" }), ENV_READ_REASON);
  assert.equal(envReadRefusal("Grep", { glob: "{.env,x}" }), ENV_READ_REASON);
  for (const input of [
    { pattern: ".env" },
    { pattern: "KC_ADMIN_PASSWORD", path: "docs" },
    { pattern: ".env", glob: "*.md" },
    { pattern: "x", path: "app/config/deploy/.env.example" },
  ]) {
    assert.equal(envReadRefusal("Grep", input), null, JSON.stringify(input));
  }
});

test("US-QG-07: a Bash command that reads a secret env file is refused: readers, redirections, wrappers, substitutions and shell strings", () => {
  for (const cmd of [
    "cat .env.worktree",
    "sed -n 1p .env.worktree",
    "head .env.worktree",
    "tail -n 3 .env.worktree",
    "less .env",
    "grep FOO .env",
    "awk '{print}' .env",
    "source .env",
    ". ./.env",
    "cut -c1-40 .env",
    "strings .env",
    "xxd .env",
    "cp .env.worktree /tmp/x",
    "cat < .env",
    'cat ".env.worktree"',
    "cd x && cat .env.local",
    "echo $(cat .env)",
    "bash -c 'cat .env'",
    "xargs cat <<< .env",
    "docker compose --env-file app/config/dev/.env up",
    "cat app/config/dev/.env",
    "./.env",
    "cat .e''nv",
    "cat ~/x/.env",
    "cat $HOME/.env",
    "cat a.txt; cat .env",
    "cat .env|wc -c",
    "echo x > .env",
    "tee .env",
    "mv .env.worktree x.txt",
    "git show HEAD:app/config/dev/.env",
    "gh api -F body=@.env.worktree repos/x",
    "make -f .env.worktree",
    "timeout 5 cat .env",
    "sudo cat .env",
    "nohup sh -c 'cat .env' &",
    "eval 'cat .env'",
    "env FOO=1 cat .env",
    "F=.env && cat $F",
    "cat x; { cat .env; }",
    "if [ -f .env ]; then cat .env; fi",
  ]) {
    refusesEnv(cmd);
  }
});

test("US-QG-07: glob and brace patterns that can name a .env file are refused in Bash too; `cat *env*` names no dotfile and passes", () => {
  for (const cmd of [
    "cat .env*",
    "cat .env.*",
    "cat .*",
    "cat .e?v",
    "cat .[e]nv",
    "cat app/*/.env",
    "cat .{env,x}",
    "cat .{e..e}nv",
  ]) {
    refusesEnv(cmd);
  }
  for (const cmd of ["cat *.md", "cat *env*", "cat app/*.ts"]) passesEnv(cmd);
});

test("US-QG-07: code that a shell or a script runs is judged as code: a pipe into a shell, a shell or python heredoc, bash -c, an unquoted substitution in a heredoc", () => {
  for (const cmd of [
    `echo "cat .env" | bash`,
    "bash <<'EOF'\ncat .env\nEOF",
    "cat <<EOF | bash\ncat .env\nEOF",
    "python3 - <<'EOF'\nprint(open('.env').read())\nEOF",
    `python3 -c "print(open('.env').read())"`,
    "cat <<EOF\n$(cat .env)\nEOF",
    "cat <<EOF\ncat .env",
  ]) {
    refusesEnv(cmd);
  }
  // A shell that runs a heredoc of plain text, and a quoted heredoc (its body is not run), pass.
  passesEnv("bash <<'EOF'\necho ok\nEOF");
  passesEnv("cat <<'EOF'\n$(cat .env)\nEOF");
});

test("US-QG-07: a Bash command that names a .env file without reading it passes: ls, test, stat, touch, rm, make, git and gh text, heredoc bodies", () => {
  for (const cmd of [
    "ls -la .env.worktree",
    "test -f .env.worktree",
    "[ -f .env ] && echo yes",
    "stat .env.worktree",
    "touch .env.worktree",
    "rm -f .env.worktree",
    "make dev",
    "make e2e",
    'git commit -m "fix: never read .env.worktree"',
    'gh pr create --body "... .env ..."',
    "git status .env",
    "git check-ignore -v .env.worktree",
    "cat .env.example",
    "cat app/config/deploy/.env.example",
    "echo 'read .env.worktree never'",
    "cat foo.env",
    "cat .envrc",
    "npm run test:tools",
    "git commit -F - <<'EOF'\nfix: never read .env.worktree\nEOF",
    "gh pr create --body-file - <<'EOF'\nThe file .env.worktree stays local.\nEOF",
    `git commit -m "$(cat <<'EOF'\nfix: note .env.worktree\nEOF\n)"`,
  ]) {
    passesEnv(cmd);
  }
  assert.equal(envReadBash("cat .env.worktree"), ENV_READ_REASON);
  assert.equal(envReadBash("ls -la .env.worktree"), null);
});

test("US-QG-07: a command the check cannot read is refused when it names a .env file, and a $'...' quote is judged as the text it spells", () => {
  refusesEnv('cat ".env.worktree');
  passesEnv('echo "unclosed');
  refusesEnv("cat $'\\x2e'env");
  refusesEnv("cat $'.env'");
  refusesEnv("cat $'\\x2e\\x65nv'");
  refusesEnv('cat $".env.worktree"');
  passesEnv("IFS=$'\\n'");
  passesEnv("printf $'\\t'");
});

test("US-QG-07: characters that only look like quotes or substitutions pass: a $ at the end of a regex, a $ inside double quotes", () => {
  passesEnv("grep -E 'foo$' file");
  passesEnv("sed 's/x$//' app/x.ts");
  passesEnv("grep -v '^$' x");
  passesEnv('echo "costs $"');
  passesEnv("gh api repos/x --jq 'test(\"x$\")'");
});

test("US-QG-07: the limits of the text check are documented: a name read from a pipe, git grep over untracked files, docker compose config, a git alias and a script written to disk are not seen", () => {
  // These pass on purpose only because the check reads command text; they are not a decision to allow them (see the report of
  // issue 2354). A change of this behaviour changes the test.
  assert.equal(envReadBash("ls -a | xargs cat"), null);
  assert.equal(envReadBash("git grep --untracked KC_ADMIN_PASSWORD app"), null);
  assert.equal(envReadBash("docker compose config"), null);
  assert.equal(envReadBash("git -c alias.x='!cat .env' x"), null);
  assert.equal(envReadBash("cat > x.sh <<'EOF'\ncat .env\nEOF"), null);
});

test("US-QG-07: the guard hook answers a Read, a Grep and a Bash command of a secret env file in the PreToolUse format, and is silent for .env.example", () => {
  const hook = fileURLToPath(new URL("./run.mjs", import.meta.url));
  const run = (event, payload) =>
    spawnSync("node", [hook, event], { input: JSON.stringify(payload), encoding: "utf8" });
  const answer = (event, payload) => {
    const result = run(event, payload);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
    return JSON.parse(result.stdout).hookSpecificOutput;
  };
  for (const [event, payload] of [
    ["guard-read", { tool_name: "Read", tool_input: { file_path: "app/config/dev/.env" } }],
    ["guard-read", { tool_name: "Grep", tool_input: { pattern: "KC", glob: ".env*" } }],
    ["guard-bash", { tool_name: "Bash", tool_input: { command: "sed -n 1p .env.worktree" } }],
  ]) {
    const out = answer(event, payload);
    assert.equal(out.hookEventName, "PreToolUse", event);
    assert.equal(out.permissionDecision, "deny", event);
    assert.equal(out.permissionDecisionReason, ENV_READ_REASON, event);
  }
  assert.equal(
    run("guard-read", {
      tool_name: "Read",
      tool_input: { file_path: "app/config/deploy/.env.example" },
    }).stdout,
    "",
  );
  assert.equal(
    run("guard-bash", { tool_name: "Bash", tool_input: { command: "make dev" } }).stdout,
    "",
  );
});

test("US-QG-07: settings.json sends Read and Grep to guard-read with a time limit of 10 seconds, next to the Bash guard", () => {
  const settings = JSON.parse(readFileSync(new URL("../settings.json", import.meta.url), "utf8"));
  const reader = settings.hooks.PreToolUse.find((entry) => entry.matcher === "Read|Grep");
  assert.ok(reader, "a PreToolUse matcher for Read and Grep");
  assert.equal(reader.hooks.length, 1);
  assert.match(reader.hooks[0].command, /run\.mjs" guard-read$/);
  assert.equal(reader.hooks[0].timeout, 10);
});

// Review rework of issue 2354 (PR #2369): one test per review item.
const refusesSearch = (cmd) => {
  const verdict = judgeCommand(cmd, WORKTREE);
  assert.equal(verdict?.decision, "deny", cmd);
  assert.equal(verdict.reason, RECURSIVE_SEARCH_REASON, cmd);
};

test("US-QG-07: grep reads directories recursively with -d recurse in every spelling; without --exclude of the .env files it is refused, and -d skip is a plain search", () => {
  for (const cmd of [
    "grep -d recurse PGPORT app",
    "grep -drecurse PGPORT app",
    "grep --directories=recurse PGPORT app",
    "grep --directories recurse PGPORT app",
  ]) {
    refusesSearch(cmd);
  }
  passesEnv("grep -d recurse --exclude='.env*' PGPORT app");
  passesEnv("grep -d skip PGPORT Makefile");
  passesEnv("grep --directories=read PGPORT Makefile");
});

test("US-QG-07: rg counts its unrestricted flags across separate flags and in the long form; one -u or one --unrestricted passes, two are refused", () => {
  for (const cmd of ["rg -u -u KEY", "rg -u -uu KEY", "rg --unrestricted --unrestricted KEY"]) {
    refusesSearch(cmd);
  }
  passesEnv("rg -u KEY");
  passesEnv("rg --unrestricted KEY");
});

test("US-QG-07: a Grep glob is split on spaces and commas, as the Grep tool splits it, and each part is judged", () => {
  for (const glob of ["*.mjs,.env.worktree", "*.ts .env*", "*.mjs, .env", "*.md ,.env.local"]) {
    assert.equal(envReadRefusal("Grep", { glob }), ENV_READ_REASON, glob);
  }
  for (const glob of ["*.mjs,*.ts", "*.md *.ts", "docs/**/*.md"]) {
    assert.equal(envReadRefusal("Grep", { glob }), null, glob);
  }
});

test("US-QG-07: the arguments after a shell's -c string are operands: $0 and $1 can name a .env file", () => {
  refusesEnv(`bash -c 'cat "$0"' .env`);
  refusesEnv("sh -c 'cat $1' _ .env");
  refusesEnv(`bash -c 'cat "$1"' x .env.worktree`);
  passesEnv(`bash -c 'echo "$0"' ls`);
});

test("US-QG-07: a request the guard cannot read is denied, a check that throws denies the command with the .env reason, and other hooks keep failing as before", () => {
  const hook = fileURLToPath(new URL("./run.mjs", import.meta.url));
  const garbled = spawnSync("node", [hook, "guard-read"], { input: "{not json", encoding: "utf8" });
  assert.equal(garbled.status, 0, garbled.stderr);
  const denied = JSON.parse(garbled.stdout).hookSpecificOutput;
  assert.equal(denied.permissionDecision, "deny");
  assert.equal(denied.permissionDecisionReason, ENV_READ_REASON);
  const deepGlob = spawnSync("node", [hook, "guard-read"], {
    input: JSON.stringify({ tool_name: "Grep", tool_input: { glob: "{a}".repeat(20000) } }),
    encoding: "utf8",
  });
  assert.equal(JSON.parse(deepGlob.stdout).hookSpecificOutput.permissionDecision, "deny");
  const verdict = judgeCommand("{a}".repeat(20000), WORKTREE);
  assert.equal(verdict?.decision, "deny");
  assert.equal(verdict.reason, ENV_READ_REASON);
  const other = spawnSync("node", [hook, "guard-bash"], { input: "{not json", encoding: "utf8" });
  assert.notEqual(other.status, 0);
  assert.equal(other.stdout, "");
});

test("US-QG-07: each simple command is judged on its own: a .env name in a commit message does not make the next command a reader", () => {
  passesEnv('git commit -m "docs: a .env rule note" && node --test');
  passesEnv('git commit -m "feat: x .env y" && make ci');
  refusesEnv('echo "cat .env" | bash');
  refusesEnv('echo "cat .env" | bash && make ci');
});

test("US-QG-07: `[[ -f .env.worktree ]]` is a test and passes; a read after it is still refused", () => {
  passesEnv("[[ -f .env.worktree ]]");
  refusesEnv("[[ -f .env.worktree ]] && cat .env.worktree");
});

test("US-QG-07: find only lists names, so it passes; an exec that may read every file it finds is refused unless -name keeps it off the secret files", () => {
  passesEnv("find . -name '.env*'");
  passesEnv("find app -name '*.ts' -exec grep -l TODO {} +");
  passesEnv("find . -name .env.worktree -exec ls -la {} \\;");
  passesEnv("find . -name '*.md' -fprint /tmp/list.txt");
  refusesEnv("find . -name '.env*' -exec cat {} \\;");
  refusesEnv("find . -exec cat {} \\;");
  refusesEnv("find . -name '*.ts' -o -name '.env*' -exec cat {} \\;");
  refusesEnv("find . -name '*.ts' -exec cat .env {} \\;");
  refusesEnv("find . -name '*.md' -fprint .env");
});

test("US-QG-07: names that a pipeline feeds to xargs are judged: a find of .env files piped to cat is refused", () => {
  refusesEnv("find . -name '.env*' -print0 | xargs -0 cat");
  refusesEnv("printf '.env.worktree' | xargs cat");
  passesEnv("find . -name '.env*' | xargs ls -la");
  passesEnv("find . -name '*.ts' | xargs cat");
});

test("US-QG-07: heredocs with a backslash-quoted delimiter, a dash in the delimiter or a dash before it hold text, and a shell run from one is still judged", () => {
  passesEnv("gh pr create --body-file - <<\\EOF\nThe file .env.worktree stays local.\nEOF");
  passesEnv("gh pr create --body-file - <<'PR-BODY'\nThe file .env.worktree stays local.\nPR-BODY");
  passesEnv("git commit -F - <<-EOF\n\tfix: never read .env.worktree\n\tEOF");
  refusesEnv("bash <<-'PR-BODY'\ncat .env\n\tPR-BODY");
  refusesEnv("bash <<\\SH\ncat .env\nSH");
});

test("US-QG-07: a recursive grep is refused unless --exclude keeps the .env files out; a plain grep and rg without hidden files pass", () => {
  for (const cmd of [
    "grep -rn PGPORT .",
    "grep -R PGPORT app",
    "grep --recursive PGPORT app",
    "grep --dereference-recursive PGPORT app",
    "grep -nr PGPORT app",
    "egrep -rn PGPORT app",
  ]) {
    refusesSearch(cmd);
  }
  for (const cmd of [
    "grep -rn --exclude='.env*' PGPORT .",
    "grep -rn --exclude=.env* PGPORT .",
    "grep -rn --exclude '.env*' PGPORT .",
    "grep -n PGPORT Makefile",
    "rg PGPORT",
    "rg -u PGPORT",
  ]) {
    passesEnv(cmd);
  }
  for (const cmd of [
    "rg --hidden PGPORT",
    "rg -uu PGPORT",
    "rg -uuu PGPORT",
    "rg -. PGPORT",
    "rg --no-ignore --hidden PGPORT",
    "rg -nuu PGPORT",
  ]) {
    refusesSearch(cmd);
  }
});

test("US-QG-07: settings.json denies Read of .env.worktree as a second layer, and no Read deny rule matches .env.example", () => {
  const settings = JSON.parse(readFileSync(new URL("../settings.json", import.meta.url), "utf8"));
  const deny = settings.permissions.deny;
  assert.ok(deny.includes("Read(**/.env.worktree)"), "a Read deny rule for .env.worktree");
  const readGlobs = deny
    .filter((rule) => rule.startsWith("Read("))
    .map((rule) => rule.slice("Read(".length, -1));
  const matches = (glob, path) =>
    new RegExp(
      `^${glob
        .split("**/")
        .map((part) =>
          part
            .split("*")
            .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
            .join("[^/]*"),
        )
        .join("(?:.*/)?")}$`,
    ).test(path);
  assert.ok(readGlobs.some((glob) => matches(glob, ".env.worktree")));
  for (const path of [".env.example", "app/config/deploy/.env.example"]) {
    assert.ok(!readGlobs.some((glob) => matches(glob, path)), path);
  }
});
