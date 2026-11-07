// The main checkout guard (US-QG-07, issue #1519): `git reset --hard` and `git clean` may not act on the main checkout
// of this repository. Agents work in a worktree (AGENTS.md, rule 5); a reset or clean in the main checkout destroys
// uncommitted work that nothing can bring back.
//
// Pure. The caller passes the folder the shell is in and what git knows about the worktrees (run.mjs reads them); the
// tests pass fixed values. The command is read the way a shell reads it, so that a `cd`, a subshell, `git -C`,
// `--git-dir` or `--work-tree`, `sh -c`, `eval` or a `$(...)` substitution does not move it out of the check. Where the
// folder cannot be told, the command is refused: a false refusal costs little, a miss loses work.

import path from "node:path";
import { ParseError, tokenize } from "./shell-words.mjs";

// A heredoc body is text, not a command (the same rule as stripText in rules.mjs).
const HEREDOC = /<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2(?=\n|$)/g;
// Words in front of a command name that do not change where it runs, or that run the word after them.
const PREFIXES = new Set([
  "env",
  "command",
  "exec",
  "nohup",
  "time",
  "sudo",
  "!",
  "{",
  "}",
  "if",
  "then",
  "else",
  "elif",
  "do",
  "while",
  "until",
]);
const SHELLS = new Set(["sh", "bash", "zsh", "dash", "ksh"]);
// git reset takes any unique prefix of --hard as --hard: `--h`, `--ha`, `--har` and `--hard` all reset the working tree
// (probed with git 2.56 in a throwaway repository; `--hardx` is unknown to git, so it does nothing). Shared with rules.mjs.
export const HARD_RESET_FLAG = /^--h(a(r(d)?)?)?$/;

// A command the check refuses. Its message is the reason the agent reads.
class Refusal extends Error {}

const UNREADABLE =
  "The command cannot be read well enough to see where `git reset --hard` or `git clean` would run (unclosed quotes, " +
  "parentheses or substitutions). Run it as plain commands from a worktree (US-QG-07).";
const mainReason = (label, folder) =>
  `\`${label}\` would act on the main checkout (${folder}). Agents never reset or clean the main checkout: run it from a ` +
  "worktree, or name one with `git -C <worktree>` (AGENTS.md, rule 5; US-QG-07).";
const unknownReason = (what) =>
  `${what} cannot be shown to stay out of the main checkout: the folder it runs in is not known. The cause can be a ` +
  "relative `cd` while the shell may be in the main checkout, a path, variable or substitution that cannot be resolved, " +
  "or a folder that does not exist. Name the worktree with an absolute path (`git -C /absolute/worktree ...`). A false " +
  "refusal costs little, a miss loses work (US-QG-07).";
const gitLabel = (subcommand) => (subcommand === "clean" ? "git clean" : "git reset --hard");

const union = (a, b) => new Set([...a, ...b]);

// The place as the judgement reads it. Folders are resolved with `realpath`. What is not known gives the safe answer:
// no folder exists, and with no main checkout known every reset or clean is refused.
function contextOf(where) {
  const realpath = where.realpath ?? ((p) => p);
  return {
    cwd: where.cwd ? realpath(where.cwd) : null,
    main: where.main ? realpath(where.main) : undefined,
    linked: (where.linked ?? []).map((p) => realpath(p)),
    isFolder: where.isFolder ?? (() => false),
    realpath,
  };
}

// "main" for the main checkout and every folder under it that no linked worktree takes, "linked" for a linked worktree,
// "other" for any other folder, "unknown" when the folder or the main checkout is not known.
function placeKind(folder, ctx) {
  if (folder === null || ctx.main === undefined) return "unknown";
  const real = ctx.realpath(folder);
  const within = (root) => real === root || real.startsWith(root + path.sep);
  if (ctx.linked.some(within)) return "linked";
  return within(ctx.main) ? "main" : "other";
}
const unsafe = (kind) => kind === "main" || kind === "unknown";

// The folder a path word names, seen from `base` (null: not known). A variable, a glob or `~` is not known.
function folderOf(word, base) {
  if (!word || word.dynamic || word.value === "" || word.value.startsWith("~")) return null;
  if (path.isAbsolute(word.value)) return path.resolve(word.value);
  return base === null ? null : path.resolve(base, word.value);
}

// `cd` or `pushd` with one folder. A folder that is not there yet (a `mkdir` earlier in the command) or is not a folder
// makes the cd possibly fail, and then the shell stays where it was. A relative folder seen from the main checkout
// counts as unknown: it is refused rather than resolved, because a false refusal costs little.
function changeDirectory(args, entry, ctx) {
  const targets = args.filter((w) => w.value !== "--" && !/^-[LPe@]+$/.test(w.value));
  if (targets.length !== 1 || targets[0].value === "-") return { ok: new Set([null]), fail: entry };
  const [target] = targets;
  const relative = !path.isAbsolute(target.value);
  const ok = new Set();
  const fail = new Set();
  for (const base of entry) {
    let dest = relative && unsafe(placeKind(base, ctx)) ? null : folderOf(target, base);
    if (dest !== null) dest = ctx.realpath(dest);
    ok.add(dest);
    if (dest === null || !ctx.isFolder(dest)) fail.add(base);
  }
  return { ok, fail };
}

// A `git` command run in the folder `base`. Only reset --hard and clean are judged: every folder the command works in
// (the cwd, `-C`, the git dir and the work tree) must be outside the main checkout and must be known.
function judgeGit(args, env, base, ctx) {
  let dir = base;
  let gitDir = env.get("GIT_DIR");
  let workTree = env.get("GIT_WORK_TREE");
  let i = 0;
  while (i < args.length && args[i].value.startsWith("-")) {
    const opt = args[i].value;
    const next = args[i + 1];
    if (opt === "-C") {
      dir = folderOf(next, dir);
      i += 2;
    } else if (opt === "-c" || opt === "--namespace" || opt === "--config-env") {
      i += 2;
    } else if (opt === "--git-dir") {
      gitDir = next;
      i += 2;
    } else if (opt === "--work-tree") {
      workTree = next;
      i += 2;
    } else if (opt.startsWith("--git-dir=")) {
      gitDir = { ...args[i], value: opt.slice("--git-dir=".length) };
      i++;
    } else if (opt.startsWith("--work-tree=")) {
      workTree = { ...args[i], value: opt.slice("--work-tree=".length) };
      i++;
    } else {
      i++;
    }
  }
  const sub = args[i];
  if (!sub) return;
  if (sub.dynamic)
    throw new Refusal(unknownReason("A git subcommand given through a variable or substitution"));
  const destructive =
    sub.value === "clean" ||
    (sub.value === "reset" && args.slice(i + 1).some((w) => HARD_RESET_FLAG.test(w.value)));
  if (!destructive) return;
  // A git dir and a work tree named together decide where the command acts; the cwd then matters only for relative ones.
  const given = [gitDir, workTree].filter((w) => w !== undefined);
  const places = [...(given.length === 2 ? [] : [dir]), ...given.map((w) => folderOf(w, dir))];
  const label = gitLabel(sub.value);
  for (const place of places) {
    const kind = placeKind(place, ctx);
    if (kind === "main") throw new Refusal(mainReason(label, place));
    if (kind === "unknown") throw new Refusal(unknownReason(`\`${label}\``));
  }
}

// One simple command: its substitutions run in a subshell, its prefixes are dropped, and what it does to the folder
// is returned as { ok, fail }: the folders the shell may be in after it succeeded or failed.
function simpleCommand(words, entry, ctx) {
  for (const w of words) for (const text of w.subst) judgeText(text, entry, ctx);
  const env = new Map();
  const argv = [];
  for (const w of words) {
    if (argv.length === 0) {
      const assign = /^([A-Za-z_]\w*)=([\s\S]*)$/.exec(w.value);
      if (assign) {
        env.set(assign[1], { ...w, value: assign[2] });
        continue;
      }
      if (PREFIXES.has(w.value) || w.value.startsWith("-")) continue;
    }
    argv.push(w);
  }
  if (argv.length === 0) return { ok: entry, fail: entry };
  const [head, ...args] = argv;
  const name = head.dynamic ? "" : path.basename(head.value);
  switch (name) {
    case "cd":
    case "pushd":
      return changeDirectory(args, entry, ctx);
    case "popd":
      return { ok: new Set([null]), fail: entry };
    case "git":
      for (const base of entry) judgeGit(args, env, base, ctx);
      return { ok: entry, fail: entry };
    case "eval":
      // `eval` runs in the current shell, so its cd stays.
      return judgeText(args.map((w) => w.value).join(" "), entry, ctx);
    default:
      if (SHELLS.has(name)) {
        const c = args.findIndex((w) => w.value === "-c");
        if (c >= 0 && args[c + 1]) judgeText(args[c + 1].value, entry, ctx);
      }
      return { ok: entry, fail: entry };
  }
}

// A command or a subshell `( ... )`. A subshell's cd does not leave it.
function command(p, entry, ctx) {
  if (p.tokens[p.i]?.op === "(") {
    p.i++;
    sequence(p, entry, ctx);
    if (p.tokens[p.i]?.op !== ")") throw new ParseError("unclosed (");
    p.i++;
    // A redirection after the group (`(cd /x) > log`) is skipped with its target word.
    while (p.tokens[p.i]?.redir) {
      p.i++;
      if (p.tokens[p.i]?.op === undefined && !p.tokens[p.i]?.redir) p.i++;
    }
    return { ok: entry, fail: entry };
  }
  const words = [];
  while (p.i < p.tokens.length && p.tokens[p.i].op === undefined) {
    const t = p.tokens[p.i++];
    if (t.redir) {
      const target = p.tokens[p.i];
      if (target && target.op === undefined && !target.redir) p.i++;
    } else {
      words.push(t);
    }
  }
  return words.length ? simpleCommand(words, entry, ctx) : { ok: entry, fail: entry };
}

// Commands joined by `|`: each runs in its own subshell, so no cd of them reaches the next command or the rest of the list.
function pipeline(p, entry, ctx) {
  const first = command(p, entry, ctx);
  if (p.tokens[p.i]?.op !== "|" && p.tokens[p.i]?.op !== "|&") return first;
  while (p.tokens[p.i]?.op === "|" || p.tokens[p.i]?.op === "|&") {
    p.i++;
    command(p, entry, ctx);
  }
  return { ok: entry, fail: entry };
}

// Pipelines joined by `&&` (the next runs after success) or `||` (the next runs after failure).
function andOr(p, entry, ctx) {
  let res = pipeline(p, entry, ctx);
  for (;;) {
    const op = p.tokens[p.i]?.op;
    if (op !== "&&" && op !== "||") return res;
    p.i++;
    const next = pipeline(p, op === "&&" ? res.ok : res.fail, ctx);
    res =
      op === "&&"
        ? { ok: next.ok, fail: union(res.fail, next.fail) }
        : { ok: union(res.ok, next.ok), fail: next.fail };
  }
}

// A list: `;`, a newline or `&` separate and-or lists. After `;` the next list starts wherever this one may have left
// the shell; after `&` it starts where this one started, because a backgrounded cd runs in a subshell.
function sequence(p, entry, ctx) {
  let start = entry;
  let last = { ok: entry, fail: entry };
  for (;;) {
    const before = start;
    last = andOr(p, before, ctx);
    const op = p.tokens[p.i]?.op;
    if (op === undefined || op === ")") return last;
    if (op === "&") start = before;
    else if (op === ";" || op === ";;" || op === "\n") start = union(last.ok, last.fail);
    else throw new ParseError(`unexpected ${op}`);
    p.i++;
  }
}

// The text of a subshell, a substitution, `sh -c` or `eval`, judged from the folders `entry`.
function judgeText(text, entry, ctx) {
  const p = { tokens: tokenize(text), i: 0 };
  const result = sequence(p, entry, ctx);
  if (p.i < p.tokens.length) throw new ParseError("unexpected )");
  return result;
}

// The reason a command must not run, or null when it may run. `where` describes the place (see contextOf). It may
// hold: cwd (the folder the shell is in), main (the main checkout), linked (the linked worktrees), isFolder (a function
// telling whether a path is an existing folder) and realpath (a function resolving links). Missing values make the
// answer unknown.
export function mainCheckoutRefusal(command, where = {}) {
  try {
    const ctx = contextOf(where);
    judgeText(command.replace(HEREDOC, "<<heredoc"), new Set([ctx.cwd]), ctx);
    return null;
  } catch (error) {
    if (error instanceof Refusal) return error.message;
    // Only a command that names git and reset or clean can hide the reset or clean this check is for. A case or a
    // function without git cannot run one, so it is not refused for being unreadable (US-QG-07).
    return /\bgit\b/.test(command) && /\b(reset|clean)\b/.test(command) ? UNREADABLE : null;
  }
}
