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
  /^scripts\/(gitleaks|actionlint|tool|rulesets-apply)\.sh$/,
  /^app\/eslint\.config\.js$/,
  /^app\/knip\.json$/,
  /^app\/commitlint\.config\.js$/,
  /^app\/release\.config\.js$/,
  /^app\/tsconfig\.base\.json$/,
  /^app\/\.prettier(rc\.json|ignore)$/,
  /^app\/scripts\/check-[a-z-]+\.mjs$/,
  /^app\/packages\/[^/]+\/(vitest\.config\.ts|tsconfig\.json)$/,
];

export function isGateFile(relativePath) {
  return GATE_FILES.some((p) => p.test(relativePath));
}

// Shell commands an agent must never run. Each entry: pattern, reason shown to the agent.
const FORBIDDEN_COMMANDS = [
  [/--no-verify\b/, "Skipping git hooks is not allowed for agents (US-QG-07). Fix the failing check instead."],
  [/\bgit\s+commit\b[^|;&]*\s-[a-zA-Z]*n[a-zA-Z]*\b/, "`git commit -n` skips the hooks (US-QG-07)."],
  [/\bgh\s+pr\s+merge\b/, "Agents never merge pull requests; a human approves and merges (ADR 0001)."],
  [/\bgit\s+push\b[^|;&]*\s(origin\s+)?(\S+:)?(main|dev)(?![\w/.-])/, "Never push to `main` or `dev`; open a pull request (E-13)."],
  [/\bgit\s+push\b[^|;&]*\s(--force|-f)\b(?!-)/, "Plain force pushes are not allowed; use --force-with-lease on your own feature branch."],
  [/\bgit\s+config\b[^|;&]*\bcore\.hooksPath\b/, "Changing core.hooksPath disables the git hooks; use `make hooks`."],
];

// Commands that change repo-wide GitHub settings: allowed only after a human confirms.
const CONFIRM_COMMANDS = [
  [/\bgh\s+api\b[^|;&]*(-X|--method)\s*(PUT|PATCH|POST|DELETE)\b[^|;&]*\b(rulesets|branches\/[^/\s]+\/protection|code-scanning|vulnerability-alerts)\b/i,
    "This changes GitHub protection settings; update .github/rulesets/ and use scripts/rulesets-apply.sh instead."],
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

export function judgeCommand(rawCommand) {
  const command = stripText(rawCommand);
  for (const [pattern, reason] of FORBIDDEN_COMMANDS) if (pattern.test(command)) return { decision: "deny", reason };
  for (const [pattern, reason] of CONFIRM_COMMANDS) if (pattern.test(command)) return { decision: "ask", reason };
  return null;
}

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
  return relativePath.startsWith("Docs/PRODUKT-SPECS/");
}
