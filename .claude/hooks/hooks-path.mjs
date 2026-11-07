// Whether a shell command changes core.hooksPath (US-QG-07, issue 1590). Changing it turns the git hooks off, so it is
// refused; reading it is not (`git config --get core.hooksPath`, `git config core.hooksPath`, `git config --list`).
// Pure, tested in rules.test.mjs. A convenience guard for honest mistakes: CI and the rulesets repeat every check (D-02).
import { ParseError, tokenize } from "./shell-words.mjs";

export const HOOKS_PATH_REASON =
  "Changing core.hooksPath disables the git hooks; use `make hooks`. Reading it (`git config --get core.hooksPath`) is fine.";

// Git config keys are case-insensitive in the section and the name.
const KEY = /^core\.hookspath$/i;
const SETTING = /^core\.hookspath(=|$)/i;
// The legacy modes of `git config` that write, and the options that take the next word as their value.
const WRITE_MODES = new Set([
  "--unset",
  "--unset-all",
  "--add",
  "--replace-all",
  "--rename-section",
  "--remove-section",
]);
const READ_MODES = new Set([
  "--get",
  "--get-all",
  "--get-regexp",
  "--get-urlmatch",
  "--get-color",
  "--get-colorbool",
  "--list",
  "-l",
]);
const SECTION_MODES = new Set(["--rename-section", "--remove-section"]);
const CONFIG_VALUE_OPTIONS = new Set([
  "-f",
  "--file",
  "--blob",
  "-t",
  "--type",
  "--default",
  "--comment",
  "--value",
]);
// The subcommands of `git config` since git 2.46.
const WRITE_SUBCOMMANDS = new Set(["set", "unset"]);
const SECTION_SUBCOMMANDS = new Set(["rename-section", "remove-section"]);
const READ_SUBCOMMANDS = new Set(["get", "list", "edit"]);
// Options of git itself that take the next word as their value.
const GIT_VALUE_OPTIONS = new Set([
  "-C",
  "-c",
  "--git-dir",
  "--work-tree",
  "--namespace",
  "--config-env",
  "--exec-path",
]);
// Words that run the next word as the command.
const WRAPPERS = new Set(["command", "env", "exec", "nohup", "time", "sudo"]);
const SHELLS = new Set(["sh", "bash", "zsh", "dash"]);
// An environment assignment that sets the value for one git run (GIT_CONFIG_KEY_<n>, GIT_CONFIG_PARAMETERS).
const ENV_SETTING = /^GIT_CONFIG_(KEY_\d+=core\.hookspath$|PARAMETERS=.*core\.hookspath)/i;
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

// The simple commands of a token list: words only, split at operators, redirection targets left out.
function simpleCommands(tokens) {
  const commands = [[]];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.op) commands.push([]);
    else if (t.redir) i++;
    else commands[commands.length - 1].push(t);
  }
  return commands.filter((c) => c.length > 0);
}

// The `git config` arguments (after `config`) change the key: a legacy write mode, a section mode on `core`, a
// subcommand that writes, or a key followed by a value.
function configWrites(args) {
  const words = [];
  const modes = new Set();
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (CONFIG_VALUE_OPTIONS.has(a)) i++;
    else if (a.startsWith("-")) modes.add(a.split("=")[0]);
    else words.push(a);
  }
  const [first, ...rest] = words;
  if (WRITE_SUBCOMMANDS.has(first)) return rest.some((w) => KEY.test(w));
  if (SECTION_SUBCOMMANDS.has(first)) return /^core$/i.test(rest[0] ?? "");
  if (READ_SUBCOMMANDS.has(first)) return false;
  if ([...modes].some((m) => SECTION_MODES.has(m))) return /^core$/i.test(first ?? "");
  if (!KEY.test(first ?? "")) return false;
  if ([...modes].some((m) => WRITE_MODES.has(m))) return true;
  if ([...modes].some((m) => READ_MODES.has(m))) return false;
  return words.length >= 2;
}

// A git command changes the key through `-c core.hooksPath=…`, `--config-env=core.hooksPath=…` or `git config`.
function gitWrites(args) {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "-c" || a === "--config-env") {
      if (SETTING.test(args[i + 1] ?? "")) return true;
      i++;
    } else if (/^--config-env=/.test(a)) {
      if (SETTING.test(a.slice("--config-env=".length))) return true;
    } else if (GIT_VALUE_OPTIONS.has(a)) {
      i++;
    } else if (!a.startsWith("-")) {
      return a === "config" && configWrites(args.slice(i + 1));
    }
  }
  return false;
}

function commandWrites(words) {
  let i = 0;
  while (i < words.length && (ASSIGNMENT.test(words[i].value) || WRAPPERS.has(words[i].value))) {
    if (ENV_SETTING.test(words[i].value)) return true;
    i++;
  }
  const name = words[i]?.value;
  if (name === "git") return gitWrites(words.slice(i + 1).map((w) => w.value));
  if (name === "eval")
    return textWrites(
      words
        .slice(i + 1)
        .map((w) => w.value)
        .join(" "),
    );
  if (SHELLS.has(name)) {
    const c = words.findIndex((w, j) => j > i && w.value === "-c");
    if (c > 0 && words[c + 1]) return textWrites(words[c + 1].value);
  }
  return false;
}

function textWrites(text) {
  const tokens = tokenize(text);
  const substitutions = tokens.flatMap((t) => t.subst ?? []);
  return simpleCommands(tokens).some(commandWrites) || substitutions.some(textWrites);
}

// Heredoc bodies are text (commit messages, PR bodies), not commands. An unreadable command falls back to the old,
// broader rule: any git command that names the key is refused.
export function changesHooksPath(command) {
  const text = command.replace(
    /<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2(?=\n|$)/g,
    "<<heredoc",
  );
  try {
    return textWrites(text);
  } catch (e) {
    if (!(e instanceof ParseError)) throw e;
    return /\bgit\b[^|;&]*\bcore\.hooksPath\b/i.test(text);
  }
}
