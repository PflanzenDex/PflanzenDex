// Rules for the Claude Code hooks (US-QG-07, US-DEV-02). Pure functions, tested in rules.test.mjs.
// Hooks support the gates; the gates themselves live in CI and the rulesets (D-02).

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
  /^app\/\.prettier(rc\.json|ignore)$/,
  // Every non-test file under app/tools/check/ defines a gate: the check scripts and their libraries (rules, thresholds).
  /^app\/tools\/check\/(?:.+\/)?(?!.*\.(?:test|selftest)\.mjs$)[^/]+\.mjs$/,
  /^app\/tools\/workflow\/merge-pr(\.test)?\.mjs$/,
  /^app\/config\/lint\/layout\.config\.mjs$/,
  /^app\/packages\/[^/]+\/(vitest\.config\.ts|tsconfig\.json)$/,
];

export function isGateFile(relativePath) {
  return GATE_FILES.some((p) => p.test(relativePath));
}

// Shell commands an agent must never run. Each entry: pattern, reason shown to the agent.
const FORBIDDEN_COMMANDS = [
  [/--no-verify\b/, "Skipping git hooks is not allowed for agents (US-QG-07). Fix the failing check instead."],
  [/\bgit\s+commit\b[^|;&]*\s-[a-zA-Z]*n[a-zA-Z]*\b/, "`git commit -n` skips the hooks (US-QG-07)."],
  [/\bgh\s+pr\s+merge\b/, "Do not call `gh pr merge` directly; use `make merge PR=<n>`, which checks the conditions of ADR 0005."],
  [/\bgit\s+push\b[^|;&]*\s(origin\s+)?(\S+:)?(main|dev)(?![\w/.-])/, "Never push to `main` or `dev`; open a pull request (E-13)."],
  [/\bgit\s+push\b[^|;&]*\s(--force|-f)\b(?!-)/, "Plain force pushes are not allowed; use --force-with-lease on your own feature branch."],
  [/\bgit\s+config\b[^|;&]*\bcore\.hooksPath\b/, "Changing core.hooksPath disables the git hooks; use `make hooks`."],
];

// Commands that change repo-wide GitHub settings: allowed only after a human confirms.
const CONFIRM_COMMANDS = [
  [/\bgh\s+api\b[^|;&]*(-X|--method)\s*(PUT|PATCH|POST|DELETE)\b[^|;&]*\b(rulesets|branches\/[^/\s]+\/protection|code-scanning|vulnerability-alerts)\b/i,
    "This changes GitHub protection settings; update .github/rulesets/ and use tools/repo/rulesets-apply.sh instead."],
  [/\bgh\s+repo\s+edit\b/, "This changes repository settings."],
  [/\bgh\s+release\s+(create|delete|edit)\b|\bgit\s+push\b[^|;&]*\s(--tags|v\d)/, "Releases and tags come from the release workflow only (ADR 0002)."],
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
      return rest.includes("--hard");
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

export function judgeCommand(rawCommand) {
  const command = stripText(rawCommand);
  for (const [pattern, reason] of FORBIDDEN_COMMANDS) if (pattern.test(command)) return { decision: "deny", reason };
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
