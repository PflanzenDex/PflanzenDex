// Rules for the Claude Code hooks (US-QG-07, US-DEV-02). Pure functions, tested in rules.test.mjs.
// Hooks support the gates; the gates themselves live in CI and the rulesets (D-02).
import { HARD_RESET_FLAG, mainCheckoutRefusal } from "./main-checkout.mjs";

// Files that define gates, thresholds or exception lists. Agents may only change them after a human confirms (US-QG-07).
const GATE_FILES = [
  /^\.githooks\//,
  /^\.github\/workflows\//,
  /^\.github\/rulesets\//,
  /^\.github\/CODEOWNERS$/,
  /^\.github\/renovate\.json5?$/,
  /^\.claude\/settings\.json$/,
  /^\.claude\/hooks\//,
  /^\.gitleaksignore$/,
  /^Makefile$/,
  /^tools\/(lint\/(gitleaks|actionlint|tool)|repo\/rulesets-apply)\.sh$/,
  /^app\/eslint\.config\.js$/,
  /^app\/config\/lint\/knip\.json$/,
  /^app\/config\/project\/commitlint\.config\.js$/,
  /^app\/config\/project\/release\.config\.js$/,
  /^app\/config\/project\/tsconfig\.base\.json$/,
  // The allowed issue types and epics (FR-DEV-10): a new type or epic is approved by the owner.
  /^app\/config\/project\/issue-taxonomy\.json$/,
  /^app\/\.prettier(rc\.json|ignore)$/,
  // Every non-test file under app/tools/check/ defines a gate: the check scripts and their libraries (rules, thresholds).
  /^app\/tools\/check\/(?:.+\/)?(?!.*\.(?:test|selftest)\.mjs$)[^/]+\.mjs$/,
  /^app\/tools\/workflow\/merge-pr(\.test)?\.mjs$/,
  /^app\/config\/lint\/layout\.config\.mjs$/,
  // Thresholds and exception lists (US-QG-07, FR-QG-18): every JSON file directly in app/config/gates/ (coverage,
  // code limits, audit and conformance allowlists). The baselines in app/config/gates/baselines/ stay out of this list:
  // a shrink needs no human, a change that grows one is judged by baseline-growth.mjs (US-QG-07, FR-QG-17).
  /^app\/config\/gates\/[^/]+\.json$/,
  /^app\/packages\/[^/]+\/(vitest\.config\.ts|tsconfig\.json)$/,
  // The display tolerances (US-QG-07, FR-QG-17): the one-screen limits in baseline.ts, what a measurement means in
  // judge.ts, and the a11y judgement in findings.ts and axe-findings.ts (what counts as worse than the baseline).
  // Loosening any of them turns a red run green.
  /^app\/packages\/e2e\/support\/display\/one-screen\/baseline\.ts$/,
  /^app\/packages\/e2e\/support\/display\/one-screen\/judge\.ts$/,
  /^app\/packages\/e2e\/support\/display\/a11y\/findings\.ts$/,
  /^app\/packages\/e2e\/support\/display\/a11y\/axe-findings\.ts$/,
  // check-changelog.mjs imports its logic from this file (US-QG-07).
  /^app\/packages\/web\/src\/app\/destinations\/account-area\/whats-new\/news-lines\.mjs$/,
];

export function isGateFile(relativePath) {
  return GATE_FILES.some((p) => p.test(relativePath));
}

// The gate test files: `*.test.mjs`, `*.test.ts`, `*.test.js` and `*.selftest.mjs` (US-QG-07). They stay gate files: merge-pr.mjs
// refuses a PR that changes one, so a human sees it at the merge. An edit of one asks no question in the hook, because a test
// changes no threshold or exception list (owner decision 2026-11-07).
const GATE_TEST = /\.(?:test\.(?:mjs|ts|js)|selftest\.mjs)$/;

// Whether an edit of this file asks a human in the hook (US-QG-07): a gate file that is not a gate test. guard-edit, after-edit
// and the list a question names use it. merge-pr.mjs and gate-review.mjs keep isGateFile, which counts the tests too.
export function asksBeforeEdit(relativePath) {
  return isGateFile(relativePath) && !GATE_TEST.test(relativePath);
}

// Shell commands an agent must never run. Each entry: pattern, reason shown to the agent.
const FORBIDDEN_COMMANDS = [
  [/--no-verify\b/, "Skipping git hooks is not allowed for agents (US-QG-07). Fix the failing check instead."],
  [/\bgit\s+commit\b[^|;&]*\s-[a-zA-Z]*n[a-zA-Z]*\b/, "`git commit -n` skips the hooks (US-QG-07)."],
  [/\bgh\s+pr\s+merge\b/, "Do not call `gh pr merge` directly; use `make merge PR=<n>`, which checks the conditions of ADR 0005."],
  [/\bgit\s+push\b[^|;&]*\s(origin\s+)?(\S+:)?(main|dev)(?![\w/.-])/, "Never push to `main` or `dev`; open a pull request (E-13)."],
  [/\bgit\s+push\b[^|;&]*\s(--force|-f)\b(?!-)/, "Plain force pushes are not allowed; use --force-with-lease on your own feature branch."],
  [/\bgit\s+config\b[^|;&]*\bcore\.hooksPath\b/, "Changing core.hooksPath disables the git hooks; use `make hooks`."],
  [/\bgh\s+issue\s+create\b/, "Create issues with `make issue TYPE= EPIC= PRIORITY= TITLE= BODY=` (FR-DEV-10): it sets the type and epic labels and the board fields."],
];

// Commands that change repo-wide GitHub settings: allowed only after a human confirms.
const CONFIRM_COMMANDS = [
  [/\bgh\s+api\b[^|;&]*(-X|--method)\s*(PUT|PATCH|POST|DELETE)\b[^|;&]*\b(rulesets|branches\/[^/\s]+\/protection|code-scanning|vulnerability-alerts)\b/i,
    "This changes GitHub protection settings; update .github/rulesets/ and use tools/repo/rulesets-apply.sh instead."],
  [/\bgh\s+repo\s+edit\b/, "This changes repository settings."],
  [/\bgh\s+release\s+(create|delete|edit)\b|\bgit\s+push\b[^|;&]*\s(--tags|v\d)/, "Releases and tags come from the release workflow only (ADR 0002)."],
  [/\bgh\s+label\s+(create|edit|delete|clone)\b/, "Label changes need the owner (FR-DEV-10): a new type or epic is a pull request to app/config/project/issue-taxonomy.json."],
];

// Heredoc bodies and quoted strings are text (commit messages, PR bodies), not commands; drop them before judging.
// This is a convenience guard for honest mistakes; the rulesets on GitHub are the real barrier (D-02).
export function stripText(command) {
  return command
    .replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2(?=\n|$)/g, "<<heredoc")
    .replace(/'[^']*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""');
}

// Adding a dependency (a package name after install/add). Bare `npm ci` and `npm install` are fine.
const ADD_DEPENDENCY = /\b(?:npm\s+(?:install|i|add)|pnpm\s+(?:add|install|i)|yarn\s+add)(?:\s+-\S+)*\s+[^-\s|;&]/;
const ADD_DEPENDENCY_REASON =
  "New dependencies need a justification (supply chain, knip, bundle size). Say why the package is needed and why no existing one fits.";

// Worktree-local throwaway directories that `rm -rf` may delete without asking.
const THROWAWAY_DIRS = new Set(["node_modules", "dist", "coverage", ".cache"]);

function isThrowawayTarget(target) {
  if (!target || /^[/~$]/.test(target) || /[`()]/.test(target)) return false;
  const parts = target.split("/").filter((part) => part && part !== ".");
  return parts.length > 0 && !parts.includes("..") && THROWAWAY_DIRS.has(parts[parts.length - 1]);
}

function commandSegments(command) {
  return command.split(/[;&|\n]+/).map((segment) => segment.trim().split(/\s+/).filter(Boolean));
}

function removesOutsideThrowaway(tokens) {
  if (tokens[0] !== "rm") return false;
  const recursive = tokens.slice(1).some((t) => t === "--recursive" || /^-[a-zA-Z]*[rR]/.test(t));
  if (!recursive) return false;
  const targets = tokens.slice(1).filter((t) => !t.startsWith("-"));
  return targets.length === 0 || !targets.every(isThrowawayTarget);
}

function discardsWork(tokens) {
  if (tokens[0] !== "git") return false;
  const subIndex = tokens.findIndex((t, i) => i > 0 && !t.startsWith("-"));
  if (subIndex < 0) return false;
  const rest = tokens.slice(subIndex + 1);
  switch (tokens[subIndex]) {
    case "reset":
      return rest.some((t) => HARD_RESET_FLAG.test(t));
    case "clean":
      return rest.some((t) => t === "--force" || /^-[a-zA-Z]*f/.test(t));
    case "checkout":
      return rest.includes(".");
    case "restore": {
      const stagedOnly = rest.includes("--staged") && !rest.includes("--worktree") && !rest.includes("-W");
      return !stagedOnly && rest.includes(".");
    }
    default:
      return false;
  }
}

// The hook's record files in the git directory of a worktree: claude-gate-confirmations.json, claude-gate-plan.json,
// claude-gate-plan-asked.json and claude-gates-fingerprint (gate-confirmations.mjs, run.mjs). Only the hook and `make gate-plan`
// write them (US-QG-07). A command that names one is refused, reads included: a text check cannot tell a write from a read (cp
// and mv take either direction, a script writes by its code), and no agent needs to read them. The pattern also covers the globs
// that name them, such as `claude-gate-*`. Quotes and backslashes are dropped first, so `claude-"gate"-plan.json` is caught too.
// What a text check cannot catch: a name assembled at run time (a variable, printf escapes, a brace expansion), and a name built
// from several writes (a file written in parts, an edit that completes a name already in the file). A script whose new text names
// a record is refused when it is written (recordWriteRefusal), so only a name split over several writes gets through. The
// rulesets, CI and the merge review (make merge refuses a gate change) stay the real gate (D-02).
const RECORD_NAME = /claude-gates?-/;
const RECORD_REASON =
  "claude-gate* files are the hook's records of confirmed gate files and of the plan (US-QG-07). Only the hook and `make gate-plan FILES=...` write them, so no command names them.";

// Whether a text names a record. Quotes and backslashes are dropped first, so `claude-"gate"-plan.json` is caught too. The shell
// guard (judgeCommand) and the Write and Edit guard (recordWriteRefusal) share this one check (US-QG-07).
export function namesRecord(text) {
  return RECORD_NAME.test(text.replace(/["'\\]/g, ""));
}

// `where` tells the main checkout guard where the command runs (see main-checkout.mjs); without it, a reset or clean
// is refused, because the place is not known (US-QG-07). The record check reads the raw text: stripText would drop a quoted
// name, so it runs first.
export function judgeCommand(rawCommand, where = {}) {
  if (namesRecord(rawCommand)) return { decision: "deny", reason: RECORD_REASON };
  const command = stripText(rawCommand);
  for (const [pattern, reason] of FORBIDDEN_COMMANDS) if (pattern.test(command)) return { decision: "deny", reason };
  const refusal = mainCheckoutRefusal(rawCommand, where);
  if (refusal) return { decision: "deny", reason: refusal };
  for (const [pattern, reason] of CONFIRM_COMMANDS) if (pattern.test(command)) return { decision: "ask", reason };
  if (ADD_DEPENDENCY.test(command)) return { decision: "ask", reason: ADD_DEPENDENCY_REASON };
  const segments = commandSegments(command);
  if (segments.some(removesOutsideThrowaway)) {
    return { decision: "ask", reason: "`rm -rf` outside node_modules, dist, coverage and .cache can destroy work. Confirm the exact path." };
  }
  if (segments.some(discardsWork)) {
    return { decision: "ask", reason: "This discards uncommitted work (reset --hard, clean -f, checkout/restore of the whole tree). Commit or stash first, or confirm." };
  }
  return null;
}

// A Write or Edit whose new text names a record is refused outside .claude/hooks (US-QG-07): a script that names one could write
// it, and no command needs to. The hook code and its tests may name them. Every file type counts, because a script needs no
// extension (`bash run.txt` runs it), and a doc that only names a record is refused too: the docs name the records with the glob
// `claude-gate*`, which the pattern does not match. `relativePath` is the file the write reaches, relative to the top of its worktree.
const WRITE_RECORD_REASON =
  "This text names a claude-gate* file, a record of the hook (US-QG-07). Outside .claude/hooks no file may name one, not even a doc, because a script with the name could write it. Name the records as `claude-gate*` in prose.";

export function recordWriteRefusal(relativePath, newTexts) {
  if (relativePath.startsWith(".claude/hooks/")) return null;
  return newTexts.some(namesRecord) ? WRITE_RECORD_REASON : null;
}

// Migrations that exist are applied or about to be: their checksum must not change (forward-only, US-DEV-07).
export function isMigrationFile(relativePath) {
  return /^app\/packages\/db\/migrations\/[^/]+\.sql$/.test(relativePath);
}

export const MIGRATION_REASON =
  "Applied migrations are immutable (forward-only, checksummed). Add a new numbered migration instead of editing this file (US-DEV-07).";

// Files whose changes count as "code" for the Stop reminder.
export function isCodePath(relativePath) {
  return /^(app\/|scripts\/|\.githooks\/|\.github\/|\.claude\/hooks\/|Makefile$)/.test(relativePath);
}

export function ranGates(command) {
  return /\bmake\s+(ci|gates)\b/.test(command);
}

export function prettierCanFormat(relativePath) {
  return /^app\/.+\.(ts|tsx|js|mjs|json|md|css|html|ya?ml)$/.test(relativePath) && !relativePath.includes("node_modules/");
}

export function isSpecPath(relativePath) {
  return relativePath.startsWith("docs/specs/product/");
}
