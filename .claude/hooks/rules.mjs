// Rules for the Claude Code hooks (US-QG-07, US-DEV-02). Pure functions, tested in rules.test.mjs; the one exception is the
// scratchpad check of `rm -r`, which resolves links on the disk (isScratchTarget, issue 2663).
// Hooks support the gates; the gates themselves live in CI and the rulesets (D-02).
import { realpathSync } from "node:fs";
import { HOOKS_PATH_REASON, changesHooksPath } from "./hooks-path.mjs";
import { HARD_RESET_FLAG, mainCheckoutRefusal } from "./main-checkout.mjs";
import { ParseError, tokenize } from "./shell-words.mjs";

// Files that define gates, thresholds or exception lists. Agents may only change them after a human confirms (US-QG-07).
const GATE_FILES = [
  /^\.githooks\//,
  /^\.github\/workflows\//,
  /^\.github\/rulesets\//,
  /^\.github\/CODEOWNERS$/,
  /^\.github\/dependabot\.ya?ml$/,
  // Everything under .claude/ (hooks, settings, rules, agents, skills, mods) as AGENTS.md says (owner decision d-128,
  // 2026-11-26, issue 2528).
  /^\.claude\//,
  // .claude/skills/* are symlinks into .agents/skills/: an edit of a SKILL.md there changes a project skill (issue 2540,
  // owner decision d-131).
  /^\.agents\/skills\//,
  /^\.gitleaksignore$/,
  /^Makefile$/,
  // The agent rules hold the gates, blocked commands and definition of done (owner decision 2026-11-20, issue 2381).
  /^AGENTS\.md$/,
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
  /^app\/tools\/workflow\/merge-pr\.mjs$/,
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
  // The size floors of the judge (issue 2431, P-S): picture, text box, row and name minimums.
  /^app\/packages\/e2e\/support\/display\/one-screen\/judge\.size\.ts$/,
  // The layout-shift judgement (US-QS-14, DS-52, issue 1697): the cumulative shift, its limit and the baseline comparison.
  /^app\/packages\/e2e\/support\/display\/one-screen\/judge\.shift\.ts$/,
  /^app\/packages\/e2e\/support\/display\/a11y\/findings\.ts$/,
  /^app\/packages\/e2e\/support\/display\/a11y\/axe-findings\.ts$/,
  // check-changelog.mjs imports its logic from this file (US-QG-07).
  /^app\/packages\/web\/src\/app\/destinations\/account-area\/whats-new\/news-lines\.mjs$/,
];

// A test file: `*.test.mjs`, `*.test.ts`, `*.test.js` or `*.selftest.mjs`.
const GATE_TEST = /\.(?:test\.(?:mjs|ts|js)|selftest\.mjs)$/;

// The gate tests are the tests of gate and check code, and only those (US-QG-07, owner decision 2026-11-16, issue 2222): a
// test file in one of these places. Loosening such a test lets a weaker gate pass, so a human reviews it at the merge. The
// places: the hooks; the check scripts (each non-test file there is a gate file); the gate shell scripts in tools/lint/;
// make merge (merge-pr); and ci-reuse, which decides whether a CI job runs, what the CI verdict is (quarantine) and how a
// gate pull request is read (gate-review). The tests of the product (app/packages/**) and of product and process tooling
// (app/tools/keycloak, app/tools/dev, app/tools/layout-fix, the claim, board, worktree, issue, deploy, project-status and
// retro tools, tools/repo and the other folders of tools/) are no gate tests: agents merge them.
const GATE_TEST_PLACES = [
  /^\.claude\/hooks\//,
  /^app\/tools\/check\//,
  /^tools\/lint\//,
  /^app\/tools\/workflow\/merge-pr\.[^/]+$/,
  /^app\/tools\/workflow\/actions\/ci-reuse\//,
];

function isGateTest(relativePath) {
  return GATE_TEST.test(relativePath) && GATE_TEST_PLACES.some((p) => p.test(relativePath));
}

// The one list of gate files (US-QG-07): make merge (merge-pr.mjs), the owner-merge label (owner-merge-label.mjs), make
// gate-review and make gate-plan all use it. It counts the gate tests; the hook asks before an edit by asksBeforeEdit.
export function isGateFile(relativePath) {
  return GATE_FILES.some((p) => p.test(relativePath)) || isGateTest(relativePath);
}

// Whether an edit of this file asks a human in the hook (US-QG-07): a gate file that is not a gate test. A gate test asks no
// question, because a test changes no threshold or exception list (owner decision 2026-11-07). make merge refuses a PR that
// changes one, so a human sees it at the merge. isGateTest judges a test by its place and name, as isGateFile does, so a
// test of a mod under .claude/ asks (issue 2528). guard-edit, after-edit, guard-bash and gate-plan use it (issue 2554).
export function asksBeforeEdit(relativePath) {
  return isGateFile(relativePath) && !isGateTest(relativePath);
}

// Shell commands an agent must never run. Each entry: pattern, reason shown to the agent.
const FORBIDDEN_COMMANDS = [
  [
    /--no-verify\b/,
    "Skipping git hooks is not allowed for agents (US-QG-07). Fix the failing check instead.",
  ],
  [
    /\bgit\s+commit\b[^|;&]*\s-[a-zA-Z]*n[a-zA-Z]*\b/,
    "`git commit -n` skips the hooks (US-QG-07).",
  ],
  [
    /\bgh\s+pr\s+merge\b/,
    "Do not call `gh pr merge` directly; use `make merge PR=<n>`, which checks the conditions of ADR 0005.",
  ],
  [
    /\bgit\s+push\b[^|;&]*\s(origin\s+)?(\S+:)?(main|dev)(?![\w/.-])/,
    "Never push to `main` or `dev`; open a pull request (E-13).",
  ],
  [
    /\bgit\s+push\b[^|;&]*\s(--force|-f)\b(?!-)/,
    "Plain force pushes are not allowed; use --force-with-lease on your own feature branch.",
  ],
  [
    /\bgh\s+issue\s+create\b/,
    "Create issues with `make issue TYPE= EPIC= PRIORITY= TITLE= BODY=` (FR-DEV-10): it sets the type and epic labels and the board fields.",
  ],
  // The owner's branch-wide allow of a gate file (US-QG-07, issue 2554): only the owner runs it, in an own shell.
  [
    /\bgate-allow\b/,
    "Only the owner runs `gate-allow`, in the owner's own shell, to allow gate files for the rest of the branch (US-QG-07, issue 2554).",
  ],
];

// Commands that change repo-wide GitHub settings: allowed only after a human confirms.
const CONFIRM_COMMANDS = [
  [
    /\bgh\s+api\b[^|;&]*(-X|--method)\s*(PUT|PATCH|POST|DELETE)\b[^|;&]*\b(rulesets|branches\/[^/\s]+\/protection|code-scanning|vulnerability-alerts)\b/i,
    "This changes GitHub protection settings; update .github/rulesets/ and use tools/repo/rulesets-apply.sh instead.",
  ],
  [/\bgh\s+repo\s+edit\b/, "This changes repository settings."],
  [
    /\bgh\s+release\s+(create|delete|edit)\b|\bgit\s+push\b[^|;&]*\s(--tags|v\d)/,
    "Releases and tags come from the release workflow only (ADR 0002).",
  ],
  [
    /\bgh\s+label\s+(create|edit|delete|clone)\b/,
    "Label changes need the owner (FR-DEV-10): a new type or epic is a pull request to app/config/project/issue-taxonomy.json.",
  ],
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
const ADD_DEPENDENCY =
  /\b(?:npm\s+(?:install|i|add)|pnpm\s+(?:add|install|i)|yarn\s+add)(?:\s+-\S+)*\s+[^-\s|;&]/;
const ADD_DEPENDENCY_REASON =
  "New dependencies need a justification (supply chain, knip, bundle size). Say why the package is needed and why no existing one fits.";

// Worktree-local throwaway directories that `rm -rf` may delete without asking.
const THROWAWAY_DIRS = new Set(["node_modules", "dist", "coverage", ".cache"]);

function isThrowawayTarget(target) {
  if (!target || /^[/~$]/.test(target) || /[`()]/.test(target)) return false;
  const parts = target.split("/").filter((part) => part && part !== ".");
  return parts.length > 0 && !parts.includes("..") && THROWAWAY_DIRS.has(parts[parts.length - 1]);
}

// The Claude Code scratch roots of this user: each session's scratchpad and task output sit two folders below one of them
// (<root>/<project>/<session>/). The devbox prunes idle sessions there (issue 2663), so agents keep throwaway files there.
export function scratchRoots(uid = process.getuid?.()) {
  return uid == null ? [] : [`/private/tmp/claude-${uid}`, `/tmp/claude-${uid}`];
}

function realRoot(root) {
  try {
    return realpathSync(root);
  } catch {
    return null;
  }
}

// The real path of a target that may not exist yet: the real path of its nearest existing folder plus the rest.
function realTarget(target) {
  for (let known = target; known; known = known.slice(0, known.lastIndexOf("/"))) {
    try {
      return realpathSync(known) + target.slice(known.length);
    } catch {
      // Not there (yet): try the parent folder.
    }
  }
  return null;
}

// `rm -r` may delete inside a session's scratch folder without a question (issue 2663): a literal absolute path (no variable,
// glob, `~`, quote or `..`) at least a project and a session folder below a scratch root, whose real path (links resolved)
// stays there too. Every other absolute target still asks.
export function isScratchTarget(target, roots = scratchRoots()) {
  if (!/^\/[A-Za-z0-9._@+\/-]+$/.test(target)) return false;
  const parts = target.split("/").filter((part) => part && part !== ".");
  if (parts.includes("..")) return false;
  const below = (path, root) => {
    const rest = path.startsWith(`${root}/`)
      ? path
          .slice(root.length + 1)
          .split("/")
          .filter(Boolean)
      : [];
    return rest.length >= 2;
  };
  const clean = `/${parts.join("/")}`;
  if (!roots.some((root) => below(clean, root))) return false;
  const real = realTarget(clean);
  return (
    real !== null &&
    roots.some((root) => {
      const rootReal = realRoot(root);
      return rootReal !== null && below(real, rootReal);
    })
  );
}

function commandSegments(command) {
  return command.split(/[;&|\n]+/).map((segment) => segment.trim().split(/\s+/).filter(Boolean));
}

function removesOutsideThrowaway(tokens) {
  if (tokens[0] !== "rm") return false;
  const recursive = tokens.slice(1).some((t) => t === "--recursive" || /^-[a-zA-Z]*[rR]/.test(t));
  if (!recursive) return false;
  const targets = tokens.slice(1).filter((t) => !t.startsWith("-"));
  return targets.length === 0 || !targets.every((t) => isThrowawayTarget(t) || isScratchTarget(t));
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
      const stagedOnly =
        rest.includes("--staged") && !rest.includes("--worktree") && !rest.includes("-W");
      return !stagedOnly && rest.includes(".");
    }
    default:
      return false;
  }
}

// The hook's record files in the git directory of a worktree: the claude-gate* files of the allowed gate files, of the plan and
// of the fingerprint (gate-confirmations.mjs, run.mjs). Only the hook, `make gate-plan` and `make gate-allow` write them
// (US-QG-07, issue 2554). A command that names one is refused, reads included: a text check cannot tell a write from a read (cp
// and mv take either direction, a script writes by its code), and no agent needs to read them. The pattern also covers the globs
// that name them, such as `claude-gate-*`. Quotes and backslashes are dropped first, so `claude-"gate"-plan.json` is caught too.
// What a text check cannot catch: a name assembled at run time (a variable, printf escapes, a brace expansion), and a name built
// from several writes (a file written in parts, an edit that completes a name already in the file). A script whose new text names
// a record is refused when it is written (recordWriteRefusal), so only a name split over several writes gets through. The
// rulesets, CI and the merge review (make merge refuses a gate change) stay the real gate (D-02).
const RECORD_NAME = /claude-gates?-/;
const RECORD_REASON =
  "claude-gate* files are the hook's records of allowed gate files and of the plan (US-QG-07). Only the hook, `make gate-plan FILES=...` and `make gate-allow FILES=...` write them, so no command names them.";

// Whether a text names a record. Quotes and backslashes are dropped first, so `claude-"gate"-plan.json` is caught too. The shell
// guard (judgeCommand) and the Write and Edit guard (recordWriteRefusal) share this one check (US-QG-07).
export function namesRecord(text) {
  return RECORD_NAME.test(text.replace(/["'\\]/g, ""));
}

// Secret env files (US-QG-07, issue 2354). A .env file holds values no agent reads: the admin password of the local Keycloak,
// the test database port of a worktree, the deploy values. A make target reads them itself, so no agent reads one, neither with
// Read or Grep nor with a shell command. A file is secret when its name is `.env` or starts with `.env.` (`.env.worktree`,
// `.env.local`) in any folder, except `.env.example`, which holds only the variable names. `.envrc` and `foo.env` are no such
// files. The check reads names and command text, never a file; its limits are listed at envReadBash.
export const ENV_READ_REASON =
  "Reading .env files is not allowed for agents (US-QG-07, issue 2354). The variable names are in `.env.example`; a make target reads the values itself (for example `make dev` or `make e2e`), so run the make target instead.";
// A search that would read the .env files: a recursive grep without --exclude='.env*', an rg with hidden files (US-QG-07, issue 2354).
export const RECURSIVE_SEARCH_REASON =
  "A recursive search, or a search of hidden files, reads .env files too (US-QG-07, issue 2354). Use the Grep tool, which searches without the secret files, or add --exclude='.env*' to grep. The variable names are in `.env.example`.";

// The name of a path: its last segment, without trailing slashes.
const baseName = (p) => p.replace(/\/+$/, "").split("/").pop();

/** Whether a path names a secret env file (US-QG-07, issue 2354): `.env` or `.env.*` but not `.env.example`, in any folder. */
export function isSecretEnvPath(p) {
  if (typeof p !== "string") return false;
  const name = baseName(p).toLowerCase();
  return name === ".env" || (name.startsWith(".env.") && name !== ".env.example");
}

// A name pattern can name a secret too (`.env*`, `.e?v`, `.[e]nv`, `.{env,x}`). Like the shell and ripgrep it reaches a dotfile
// only through a leading literal dot (or a class holding one): `*env` and `?env` name no dotfile. For the rest, a product of the
// pattern and the names `.env` and `.env.<anything>` shows whether some name matches both. The alphabet is the characters of the
// pattern plus these neutral ones. A pattern that matches only `.env.example` (`.env.exampl[e]`) counts as secret: a false refusal.
const NEUTRAL_CHARS = ".env_x0a9Az!#$%&'()+,-;<=>@[]^`{|}~";

// The tokens of a name pattern: a literal, `?`, a bracket class or `*`. A backslash quotes the next character.
function globTokens(pattern) {
  const tokens = [];
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "*") tokens.push({ kind: "star" });
    else if (c === "?") tokens.push({ kind: "any" });
    else if (c === "\\" && i + 1 < pattern.length) tokens.push({ kind: "lit", c: pattern[++i] });
    else {
      const cls = c === "[" ? bracketClass(pattern, i) : null;
      if (cls) {
        tokens.push(cls.token);
        i = cls.end;
      } else tokens.push({ kind: "lit", c });
    }
  }
  return tokens;
}

// A bracket class that opens at `start`: `[!a-z]`, `[]x]`. Null when no `]` closes it; the `[` is then a literal.
function bracketClass(pattern, start) {
  let j = start + 1;
  const neg = pattern[j] === "!" || pattern[j] === "^";
  if (neg) j++;
  const first = j;
  if (pattern[j] === "]") j++;
  const close = pattern.indexOf("]", j);
  if (close < 0) return null;
  const body = pattern.slice(first, close);
  const ranges = [];
  for (let k = 0; k < body.length; k++) {
    if (body[k + 1] === "-" && k + 2 < body.length) {
      ranges.push([body[k], body[k + 2]]);
      k += 2;
    } else ranges.push([body[k], body[k]]);
  }
  return { token: { kind: "class", neg, ranges }, end: close };
}

// Whether a character matches a token that is not a star. Case does not matter: macOS folders are case-insensitive.
function matchesToken(token, ch) {
  const lower = ch.toLowerCase();
  if (token.kind === "any") return true;
  if (token.kind === "lit") return token.c.toLowerCase() === lower;
  const hit = token.ranges.some(([lo, hi]) =>
    [ch, lower, ch.toUpperCase()].some((x) => x >= lo && x <= hi),
  );
  return token.neg ? !hit : hit;
}

// The automaton of the names `.env` (state 4) and `.env.<anything>` (state 5): states 0 to 3 read `.env`, -1 is no such name.
function secretStep(state, ch) {
  const c = ch.toLowerCase();
  if (state === 5) return 5;
  if (state === 4) return c === "." ? 5 : -1;
  return c === ".env"[state] ? state + 1 : -1;
}

// Whether some name matches the pattern and is `.env` or `.env.<anything>`: breadth first over the pairs (position in the pattern,
// state of the automaton). A star moves on without a character, or takes one and stays.
function secretReachable(tokens) {
  const literals = tokens.flatMap((t) =>
    t.kind === "lit" ? [t.c] : t.kind === "class" ? t.ranges.flat() : [],
  );
  const alphabet = [...new Set([...NEUTRAL_CHARS, ...literals])];
  const seen = new Set(["0,0"]);
  const queue = [[0, 0]];
  while (queue.length > 0) {
    const [p, s] = queue.shift();
    if (p === tokens.length && (s === 4 || s === 5)) return true;
    const moves = [];
    if (p < tokens.length && tokens[p].kind === "star") {
      moves.push([p + 1, s]);
      for (const ch of alphabet) if (secretStep(s, ch) >= 0) moves.push([p, secretStep(s, ch)]);
    } else if (p < tokens.length) {
      for (const ch of alphabet)
        if (matchesToken(tokens[p], ch) && secretStep(s, ch) >= 0)
          moves.push([p + 1, secretStep(s, ch)]);
    }
    for (const [np, ns] of moves) {
      const key = `${np},${ns}`;
      if (!seen.has(key)) {
        seen.add(key);
        queue.push([np, ns]);
      }
    }
  }
  return false;
}

/** Whether a file name or a name pattern can name a secret env file (US-QG-07, issue 2354). A plain name is judged by isSecretEnvPath. */
export function globCanNameSecret(name) {
  if (!/[*?[]/.test(name)) return isSecretEnvPath(name);
  const tokens = globTokens(name);
  const [first] = tokens;
  if (!first || first.kind === "star" || first.kind === "any" || !matchesToken(first, "."))
    return false;
  return secretReachable(tokens);
}

// `a..z` in braces: the letters from a to z (only single letters; numbers never make a name `.env` alone).
function letterRange(body) {
  const m = /^([A-Za-z])\.\.([A-Za-z])$/.exec(body);
  if (!m) return null;
  const lo = Math.min(m[1].charCodeAt(0), m[2].charCodeAt(0));
  const hi = Math.max(m[1].charCodeAt(0), m[2].charCodeAt(0));
  return Array.from({ length: hi - lo + 1 }, (_, k) => String.fromCharCode(lo + k));
}

// Brace expansion (`.{env,x}`, `.{e..e}nv`): each alternative is a name of its own. More than MAX_EXPANSIONS alternatives is
// refused as unreadable (ParseError, which envReadBash and envReadRefusal turn into a refusal).
const MAX_EXPANSIONS = 512;
function expandBraces(text, count = { n: 0 }) {
  const m = /\{([^{}]*)\}/.exec(text);
  if (!m) return [text];
  const before = text.slice(0, m.index);
  const after = text.slice(m.index + m[0].length);
  const alts = m[1].includes(",") ? m[1].split(",") : letterRange(m[1]);
  if (alts === null) return expandBraces(after, count).map((tail) => `${before}${m[0]}${tail}`);
  const out = [];
  for (const alt of alts) {
    for (const s of expandBraces(`${before}${alt}${after}`, count)) {
      if (++count.n > MAX_EXPANSIONS) throw new ParseError("too many brace expansions");
      out.push(s);
    }
  }
  return out;
}

// The names a word of a command may stand for: each brace alternative, split at `=`, `:` and `@` (`--env-file=.env`,
// `HEAD:.env`, `-F body=@.env`), each reduced to its last path segment. A name with a space is text (a commit message, a body).
const namesOf = (value) =>
  expandBraces(value)
    .flatMap((v) => v.split(/[=:@]/))
    .map(baseName);
const namesEnvFile = (value) =>
  namesOf(value).some((name) => !/\s/.test(name) && globCanNameSecret(name));

// Text that names a .env file where the text is code (a script, a shell's input, a substitution): `.env` standing alone, as in
// `'.env'`, `< .env` or `1r.env` in a sed program. `.env.example` and `.envrc` do not match. `process.env` does match (a false refusal).
const ENV_IN_TEXT = /\.env(?![\w-])(?!\.example(?![\w-]))/i;

// Heredocs: `<<WORD`, `<<-WORD`, `<<'WORD'` and the lines up to a line WORD. The body is taken out of the command, and the head keeps
// its rest of line (`cat <<EOF | bash`). A body without its end line stays in the text. Each body comes with its line: what runs it.
function splitHeredocs(text) {
  const bodies = [];
  // The delimiter may be quoted (`'PR-BODY'`), backslash-quoted (`\EOF`) and contain a dash; `<<-` strips tabs of the end line.
  const open = /<<(-?)[ \t]*(\\?['"]?)([^\s'"\\<>|&;()`$]+)['"]?([^\n]*)\n/g;
  let out = "";
  let pos = 0;
  for (let m = open.exec(text); m !== null; m = open.exec(text)) {
    const [head, dash, quote, delim, rest] = m;
    const bodyStart = m.index + head.length;
    let found = null;
    for (let start = bodyStart; start <= text.length;) {
      let end = text.indexOf("\n", start);
      if (end < 0) end = text.length;
      const line = text.slice(start, end);
      if ((dash ? line.replace(/^\t+/, "") : line) === delim) {
        found = { bodyEnd: start, end };
        break;
      }
      if (end >= text.length) break;
      start = end + 1;
    }
    if (found === null) continue;
    const lineStart = text.lastIndexOf("\n", m.index - 1) + 1;
    bodies.push({
      body: text.slice(bodyStart, found.bodyEnd),
      quoted: quote !== "",
      line: text.slice(lineStart, bodyStart),
    });
    out += `${text.slice(pos, m.index)}<<heredoc${rest}\n`;
    pos = found.end;
    open.lastIndex = found.end;
  }
  return { text: out + text.slice(pos), bodies };
}

// What runs the body of a heredoc, judged from its line: a shell (code judged as commands), a script program (judged as text
// that names a .env file), or nothing (text, such as a commit message or a PR body). The whole line counts: `cat <<EOF | bash`.
function codeKind(line) {
  const words = line.split(/[\s;&|()`$<>"']+/);
  if (words.some((w) => SHELLS.has(w) || w === "eval" || w === "source")) return "shell";
  if (words.some((w) => SCRIPTS.has(w))) return "script";
  return "text";
}

const SHELLS = new Set(["sh", "bash", "zsh", "dash", "ksh"]);
// Programs that run code given as text (a script, an inline program, their input): their arguments are judged as code.
const SCRIPTS = new Set([
  "sed",
  "awk",
  "gawk",
  "perl",
  "python",
  "python3",
  "node",
  "ruby",
  "php",
  "lua",
]);
// Commands that read no file content: a name among their arguments is only a name (US-QG-07, issue 2354).
const NON_READING = new Set([
  "ls",
  "test",
  "[",
  "[[",
  "echo",
  "printf",
  "rm",
  "touch",
  "mkdir",
  "stat",
]);
const GREP_NAMES = new Set(["grep", "egrep", "fgrep"]);
// find's exec actions run a command on every file it finds; its listing actions write the names into a file.
const EXEC_ACTIONS = new Set(["-exec", "-execdir", "-ok", "-okdir"]);
const LISTING_FILES = new Set(["-fprint", "-fprint0", "-fls", "-fprintf"]);
// Excludes that keep the secret files out of a recursive grep (`--exclude='.env*'`, or every dotfile).
const EXCLUDES_ENV = new Set([".env*", ".*"]);
// git subcommands that show no file content, so a .env name among their paths is no read.
const READ_FREE_GIT = new Set(["check-ignore", "ls-files", "status"]);
// Words in front of a command that run the command after them. Their options and numbers are skipped with them.
const WRAPPERS = new Set([
  "sudo",
  "doas",
  "env",
  "command",
  "builtin",
  "exec",
  "nohup",
  "time",
  "nice",
  "ionice",
  "xargs",
  "timeout",
  "stdbuf",
]);
// Shell words that open a compound command (`{ cat x; }`, `if cat x; then`). They run nothing themselves.
const COMPOUND = new Set([
  "{",
  "}",
  "!",
  "if",
  "then",
  "else",
  "elif",
  "fi",
  "do",
  "done",
  "while",
  "until",
]);
const ASSIGNMENT = /^[A-Za-z_]\w*=/;
const INLINE_CODE = /^-[a-zA-Z]*c[a-zA-Z]*$/; // bash -c, -lc, -ec
const MAX_DEPTH = 8;

// The pipelines of a token list: the simple commands joined by `|` (or `|&`) form one pipeline. The words and the redirection targets
// of a command are its own. The operators `&&`, `||`, `;`, `&`, a newline and the parentheses end a pipeline, so each simple command is
// judged with the text of its own pipeline only (US-QG-07, issue 2354).
function pipelines(tokens) {
  const list = [];
  let pipe = [];
  let cur = { words: [], redirs: [] };
  const endCommand = () => {
    if (cur.words.length > 0 || cur.redirs.length > 0) pipe.push(cur);
    cur = { words: [], redirs: [] };
  };
  const endPipeline = () => {
    endCommand();
    if (pipe.length > 0) list.push(pipe);
    pipe = [];
  };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.redir) {
      const target = tokens[i + 1];
      if (target && target.op === undefined && !target.redir) {
        cur.redirs.push(target);
        i++;
      }
    } else if (t.op === "|" || t.op === "|&") endCommand();
    else if (t.op !== undefined) endPipeline();
    else cur.words.push(t);
  }
  endPipeline();
  return list;
}

// The command name of a word: its value, unless the word holds an expansion, a variable or a substitution. A glob character is no
// expansion here: `[` is the test command.
const commandName = (w) => (w.subst.length === 0 && !w.value.includes("$") ? w.value : "");

const ANSI_ESCAPES = {
  n: "\n",
  t: "\t",
  r: "\r",
  a: "\x07",
  b: "\b",
  e: "\x1b",
  E: "\x1b",
  f: "\f",
  v: "\v",
  "\\": "\\",
  "'": "'",
  '"': '"',
  "?": "?",
};
// The text of an ANSI-C quote body (`$'…'`): \n, \t, \xHH, \NNN, \uHHHH, \UHHHHHHHH, \cX and the simple escapes. An unknown escape
// stays as written.
function decodeAnsiC(body) {
  return body.replace(
    /\\(x[0-9a-fA-F]{1,2}|[0-7]{1,3}|u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|c.|[\s\S])/g,
    (_, e) => {
      if (/^x[0-9a-fA-F]/.test(e)) return String.fromCharCode(parseInt(e.slice(1), 16));
      if (/^[uU][0-9a-fA-F]/.test(e)) return String.fromCodePoint(parseInt(e.slice(1), 16));
      if (/^[0-7]/.test(e)) return String.fromCharCode(parseInt(e, 8));
      if (/^c./.test(e)) return String.fromCharCode(e.charCodeAt(1) & 0x1f);
      return ANSI_ESCAPES[e] ?? `\\${e}`;
    },
  );
}

// The texts a word may stand for. The tokenizer keeps a `$'…'` quote as text with its escapes, and a word with `$` is dynamic: the
// word without its `$` signs (a locale quote `$"…"` is a plain quote) and the decoded text of its escapes count as well (US-QG-07).
const wordTexts = (w) => {
  if (!w.dynamic) return [w.value];
  const bare = w.value.replace(/\$/g, "");
  return [w.value, bare, decodeAnsiC(bare)];
};
const wordNames = (w) => wordTexts(w).some((t) => namesEnvFile(t));
const wordInText = (w) => wordTexts(w).some((t) => ENV_IN_TEXT.test(t));

// A pipeline whose xargs runs a command that may read: the names come from the other commands of the pipeline, so a secret name among
// their words makes the xargs a read of .env files (`find . -name '.env*' -print0 | xargs -0 cat`, US-QG-07, issue 2354).
function xargsReadsNames(pipe) {
  for (const stage of pipe) {
    const k = stage.words.findIndex((w) => w.value === "xargs");
    if (k < 0) continue;
    const runs = stage.words.slice(k + 1).find((w) => !w.value.startsWith("-"));
    if (!runs || NON_READING.has(commandName(runs))) continue;
    if (pipe.some((other) => other !== stage && other.words.some(wordNames))) {
      return ENV_READ_REASON;
    }
  }
  return null;
}

// Whether a find names only files that cannot be secret: a -name or -iname that cannot name one, not negated, with no -o alternative.
function safeNames(args) {
  if (args.some((a) => a.value === "-o" || a.value === "-or")) return false;
  return args.some(
    (a, k) =>
      (a.value === "-name" || a.value === "-iname") &&
      args[k + 1] !== undefined &&
      !globCanNameSecret(args[k + 1].value) &&
      !["-not", "!"].includes(args[k - 1]?.value),
  );
}

// find lists names, which reads no content, so only what it runs and writes is judged. An exec action runs its command on every file
// it finds: when that command may read (not NON_READING), the find must name only files that cannot be secret. The listing actions
// write the names into a file, which must not be a .env file.
function findRefusal(args, pipeText, depth) {
  for (let i = 0; i < args.length; i++) {
    const v = args[i].value;
    if (EXEC_ACTIONS.has(v)) {
      let stop = i + 1;
      while (stop < args.length && args[stop].value !== ";" && args[stop].value !== "+") stop++;
      const run = args.slice(i + 1, stop);
      if (run.length > 0) {
        const reason = judgeSimple({ words: run, redirs: [] }, pipeText, depth + 1);
        if (reason) return reason;
        if (!NON_READING.has(commandName(run[0])) && !safeNames(args)) return ENV_READ_REASON;
      }
      i = stop;
    } else if (LISTING_FILES.has(v)) {
      if (args[i + 1] && wordNames(args[i + 1])) return ENV_READ_REASON;
      i++;
    }
  }
  return null;
}

// An argument that is the value of --exclude (`--exclude=X` or `--exclude X`): grep's exclude patterns are no files to read.
const isExcludeArg = (args, k) =>
  args[k].value.startsWith("--exclude=") || args[k - 1]?.value === "--exclude";

// The search commands that read hidden files (US-QG-07, issue 2354). A recursive grep reads every file of a folder, the .env files too,
// unless --exclude names them. An rg reads hidden files with --hidden, -. or two u flags (-uu, -uuu).
function searchRefusal(name, args) {
  if (GREP_NAMES.has(name)) {
    // `-d recurse` reads the folders recursively in every spelling: `-drecurse`, `--directories=recurse`, `--directories recurse`.
    const recursesDirectories = args.some(
      (a, k) =>
        /^(?:-d|--d[a-z-]*=?)recurse$/.test(a.value) ||
        (/^(?:-d|--d[a-z-]*)$/.test(a.value) && args[k + 1]?.value === "recurse"),
    );
    const recursive =
      recursesDirectories ||
      args.some(
        (a) =>
          a.value === "--recursive" ||
          a.value === "--dereference-recursive" ||
          /^-[A-Za-z]*[rR]/.test(a.value),
      );
    if (!recursive) return null;
    const excluded = args.some((a, k) =>
      a.value.startsWith("--exclude=")
        ? EXCLUDES_ENV.has(a.value.slice("--exclude=".length))
        : a.value === "--exclude" && EXCLUDES_ENV.has(args[k + 1]?.value),
    );
    return excluded ? null : RECURSIVE_SEARCH_REASON;
  }
  // The u flags count across separate flags and the long form: one -u drops .gitignore only, two (-uu, -u -u, --unrestricted twice)
  // also search hidden files.
  const unrestricted = args.reduce((count, a) => {
    if (a.value === "--unrestricted") return count + 1;
    if (/^-[A-Za-z]+$/.test(a.value)) return count + (a.value.match(/u/g) ?? []).length;
    return count;
  }, 0);
  const hidden =
    unrestricted >= 2 ||
    args.some((a) => a.value === "--hidden" || /^-[A-Za-z]*\.[A-Za-z]*$/.test(a.value));
  return hidden ? RECURSIVE_SEARCH_REASON : null;
}

// The subcommand of a git command, skipping the options that take a value (`git -C dir status`).
function gitSubcommand(args) {
  for (let i = 0; i < args.length; i++) {
    const v = args[i].value;
    if (["-C", "-c", "--git-dir", "--work-tree"].includes(v)) i++;
    else if (!v.startsWith("-")) return v;
  }
  return null;
}

// The reason one simple command may not run because it reads a .env file, or null (US-QG-07, issue 2354). Its substitutions are
// judged first; a redirection naming a secret file is refused whatever the command; then the command word decides what the
// arguments are (see the lists above).
function judgeSimple(cmd, pipeText, depth) {
  for (const word of [...cmd.words, ...cmd.redirs]) {
    for (const inner of word.subst) {
      const reason = judgeShell(inner, depth + 1);
      if (reason) return reason;
      if (ENV_IN_TEXT.test(inner)) return ENV_READ_REASON;
    }
  }
  // The shell opens a redirection's file before the command runs: `< .env` reads it, `> .env` overwrites it.
  if (cmd.redirs.some(wordNames)) return ENV_READ_REASON;
  const words = cmd.words;
  let i = 0;
  while (i < words.length) {
    const w = words[i];
    if (ASSIGNMENT.test(w.value)) {
      if (wordNames(w)) return ENV_READ_REASON;
      i++;
    } else if (!w.dynamic && COMPOUND.has(w.value)) {
      i++;
    } else if (!w.dynamic && WRAPPERS.has(w.value)) {
      i++;
      while (i < words.length && /^(-|\d+(\.\d+)?[smhd]?$)/.test(words[i].value)) i++;
    } else break;
  }
  const [head, ...args] = words.slice(i);
  if (!head) return null;
  // A .env file run as a command (`./.env`) is read by the shell.
  if (wordNames(head)) return ENV_READ_REASON;
  const name = commandName(head);
  if (NON_READING.has(name)) return null;
  if (name === "git" && READ_FREE_GIT.has(gitSubcommand(args))) return null;
  if (name === "find") return findRefusal(args, pipeText, depth);
  if (name === "eval") return judgeShell(args.map((a) => a.value).join(" "), depth + 1);
  if (SHELLS.has(name)) {
    const c = args.findIndex((a) => INLINE_CODE.test(a.value));
    if (c >= 0) {
      // The words after the code are its positional parameters ($0, $1 ...): a name among them is a file the code can read.
      if (args.slice(c + 2).some(wordNames)) return ENV_READ_REASON;
      return args[c + 1] ? judgeShell(args[c + 1].value, depth + 1) : null;
    }
  }
  if (GREP_NAMES.has(name) || name === "rg") {
    const reason = searchRefusal(name, args);
    if (reason) return reason;
  }
  if (SHELLS.has(name) || SCRIPTS.has(name)) {
    if (args.some((a) => wordInText(a) || wordNames(a))) return ENV_READ_REASON;
    // No file or program argument: the code comes from the input (a pipe, a heredoc), so the text of the pipeline is read as code.
    if (args.every((a) => a.value.startsWith("-")) && ENV_IN_TEXT.test(pipeText)) {
      return ENV_READ_REASON;
    }
    return null;
  }
  // A grep's --exclude pattern names files to leave out, not files to read.
  const operands = GREP_NAMES.has(name) ? args.filter((a, k) => !isExcludeArg(args, k)) : args;
  return operands.some(wordNames) ? ENV_READ_REASON : null;
}

// The reason a text of commands may not run because it reads a .env file, or null. Throws ParseError when it cannot be read.
function judgeShell(text, depth) {
  if (depth > MAX_DEPTH) throw new ParseError("nested too deep");
  for (const pipe of pipelines(tokenize(text))) {
    const xargs = xargsReadsNames(pipe);
    if (xargs) return xargs;
    const pipeText = pipe.map((cmd) => cmd.words.map((w) => w.value).join(" ")).join(" | ");
    for (const cmd of pipe) {
      const reason = judgeSimple(cmd, pipeText, depth);
      if (reason) return reason;
    }
  }
  return null;
}

// The reason a Bash command may not run because it reads a .env file, or null (US-QG-07, issue 2354). The check reads the command
// the way a shell splits its words, pipeline by pipeline. Heredoc bodies are text, unless a shell or a script runs them (then they are
// judged as code; a text body with `$(` or a backtick is judged as code too). A substitution is judged as a command. A shell with `-c`
// is judged on its string and on its positional arguments, `eval` on its words, a shell or script without a file argument on its input.
// A find that runs a reader is judged by its -name tests; a recursive grep and an rg with hidden files are refused (searchRefusal).
// A text that cannot be read (an unclosed quote) is refused when it names a .env file. Not seen, so not refused: a name built at run
// time (a variable, a splice of words), a script written to disk and run later, a list of names read from a pipe that no find names
// (`ls -a | xargs cat`), `git grep --untracked`, `docker compose config` (it loads the .env of its folder), and a git alias that starts
// with `!` (`git -c alias.x='!cat .env' x`).
export function envReadBash(raw) {
  try {
    const { text, bodies } = splitHeredocs(raw);
    for (const { body, quoted, line } of bodies) {
      const kind = codeKind(line);
      if (kind === "shell") {
        const reason = judgeShell(body, 1);
        if (reason) return reason;
      } else if (kind === "script") {
        if (ENV_IN_TEXT.test(body)) return ENV_READ_REASON;
      } else if (!quoted && /\$\(|`/.test(body) && ENV_IN_TEXT.test(body)) {
        return ENV_READ_REASON;
      }
    }
    return judgeShell(text, 0);
  } catch (error) {
    if (error instanceof ParseError) return ENV_IN_TEXT.test(raw) ? ENV_READ_REASON : null;
    throw error;
  }
}

// The refusal of a Read or Grep call that reads a secret env file (US-QG-07, issue 2354), or null. Grep's pattern is text and is not
// judged; its path and its glob are. The Grep tool splits a glob on spaces and then on commas, after brace expansion, and searches
// hidden files too; a Grep without a path or glob searches the whole tree, where the Read deny rules of settings.json keep the secret
// files out (Grep turns them into exclusions).
export function envReadRefusal(toolName, toolInput = {}) {
  if (toolName === "Read") return isSecretEnvPath(toolInput.file_path) ? ENV_READ_REASON : null;
  if (toolName === "Grep") {
    if (isSecretEnvPath(toolInput.path)) return ENV_READ_REASON;
    try {
      const glob = typeof toolInput.glob === "string" ? toolInput.glob : "";
      const parts = expandBraces(glob).flatMap((g) => g.split(/[\s,]+/));
      if (parts.some((g) => globCanNameSecret(baseName(g)))) return ENV_READ_REASON;
    } catch (error) {
      if (error instanceof ParseError) return ENV_READ_REASON;
      throw error;
    }
  }
  return null;
}

// `where` tells the main checkout guard where the command runs (see main-checkout.mjs); without it, a reset or clean
// is refused, because the place is not known (US-QG-07). The record check reads the raw text: stripText would drop a quoted
// name, so it runs first.
export function judgeCommand(rawCommand, where = {}) {
  if (namesRecord(rawCommand)) return { decision: "deny", reason: RECORD_REASON };
  // The owner's allow runs only in the owner's terminal (issue 2554, round 2). The name is judged on the raw text with quotes and
  // backslashes dropped, so that "gate-allow", gate-al''low, gate-al\low and a quoted script name are refused too.
  if (/gate-?allow/.test(rawCommand.replace(/["'\\]/g, "")))
    return {
      decision: "deny",
      reason:
        "Only the owner runs `gate-allow`, in the owner's own shell, to allow gate files for the rest of the branch (US-QG-07, issue 2554).",
    };
  // A command that reads a secret .env file is refused first, whatever else it does (US-QG-07, issue 2354).
  let envReason = null;
  try {
    envReason = envReadBash(rawCommand);
  } catch {
    // A check that cannot finish refuses the command, never passes it (US-QG-07, issue 2354).
    envReason = ENV_READ_REASON;
  }
  if (envReason) return { decision: "deny", reason: envReason };
  const command = stripText(rawCommand);
  for (const [pattern, reason] of FORBIDDEN_COMMANDS)
    if (pattern.test(command)) return { decision: "deny", reason };
  // Only a change of core.hooksPath is refused; a read passes (issue 1590). It reads the raw command: quotes matter there.
  if (changesHooksPath(rawCommand)) return { decision: "deny", reason: HOOKS_PATH_REASON };
  const refusal = mainCheckoutRefusal(rawCommand, where);
  if (refusal) return { decision: "deny", reason: refusal };
  for (const [pattern, reason] of CONFIRM_COMMANDS)
    if (pattern.test(command)) return { decision: "ask", reason };
  if (ADD_DEPENDENCY.test(command)) return { decision: "ask", reason: ADD_DEPENDENCY_REASON };
  const segments = commandSegments(command);
  if (segments.some(removesOutsideThrowaway)) {
    return {
      decision: "ask",
      reason:
        "`rm -rf` outside node_modules, dist, coverage and .cache can destroy work. Confirm the exact path.",
    };
  }
  if (segments.some(discardsWork)) {
    return {
      decision: "ask",
      reason:
        "This discards uncommitted work (reset --hard, clean -f, checkout/restore of the whole tree). Commit or stash first, or confirm.",
    };
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
  return /^(app\/|scripts\/|\.githooks\/|\.github\/|\.claude\/hooks\/|Makefile$)/.test(
    relativePath,
  );
}

export function ranGates(command) {
  return /\bmake\s+(ci|gates)\b/.test(command);
}

export function prettierCanFormat(relativePath) {
  return (
    /^app\/.+\.(ts|tsx|js|mjs|json|md|css|html|ya?ml)$/.test(relativePath) &&
    !relativePath.includes("node_modules/")
  );
}

export function isSpecPath(relativePath) {
  return relativePath.startsWith("docs/specs/product/");
}
