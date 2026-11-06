#!/usr/bin/env node
// Entry point for all Claude Code hooks of this repo (US-QG-07, US-DEV-02).
// Usage from .claude/settings.json: node .claude/hooks/run.mjs <guard-edit|guard-bash|after-edit|after-bash|stop>
// A hook must never hang or break a session: every step has a time limit and unexpected errors end with exit 0.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { baselineGrows, isBaselineFile, textAfter } from "./baseline-growth.mjs";
import { CONFIRMATIONS_FILE, needsQuestion, withConfirmation } from "./gate-confirmations.mjs";
import {
  isCodePath,
  isGateFile,
  isMigrationFile,
  isSpecPath,
  judgeCommand,
  MIGRATION_REASON,
  prettierCanFormat,
  ranGates,
} from "./rules.mjs";

const event = process.argv[2];
const input = JSON.parse(fs.readFileSync(0, "utf8") || "{}");
const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { cwd: root, encoding: "utf8", timeout: 20000, stdio: ["ignore", "pipe", "pipe"], ...opts });
// Git's view of a folder: the top of its worktree, the common git dir that every worktree of one repository shares, and
// the folder with its links resolved (git reports resolved paths). Null outside a repository or when git fails (US-QG-07).
function repoAt(folder) {
  try {
    const [toplevel, common] = execFileSync("git", ["rev-parse", "--show-toplevel", "--git-common-dir"], {
      cwd: folder,
      encoding: "utf8",
      timeout: 3000,
      stdio: ["ignore", "pipe", "ignore"],
    }).split("\n");
    return { toplevel: fs.realpathSync(toplevel), common: fs.realpathSync(path.resolve(folder, common)), folder: fs.realpathSync(folder) };
  } catch {
    return null;
  }
}

// The root that owns a file, and the file's path from that root (US-QG-07, FR-QG-17). A file in a worktree of this
// repository is judged by its path inside that worktree, whichever folder the session started in. Any other file keeps
// the path from `root`, which starts with ".." and so matches no pattern.
function locate(file) {
  const abs = path.resolve(root, file ?? "");
  const fromRoot = { root, file: path.relative(root, abs).split(path.sep).join("/") };
  // A new file may sit in a folder that does not exist yet: git answers for the nearest folder that does.
  let folder = path.dirname(abs);
  while (!fs.existsSync(folder) && path.dirname(folder) !== folder) folder = path.dirname(folder);
  const session = repoAt(root);
  const owner = session && repoAt(folder);
  if (!owner || owner.common !== session.common) return fromRoot;
  const real = path.join(owner.folder, path.relative(folder, abs));
  return { root: owner.toplevel, file: path.relative(owner.toplevel, real).split(path.sep).join("/") };
}

// The path with its links resolved: the nearest folder that exists is resolved, the rest is kept as written (US-QG-07).
function realpath(p) {
  const rest = [];
  let existing = p;
  while (!fs.existsSync(existing) && path.dirname(existing) !== existing) {
    rest.unshift(path.basename(existing));
    existing = path.dirname(existing);
  }
  return path.join(fs.realpathSync(existing), ...rest);
}

// What the Bash guard needs to place a git command (US-QG-07, #1519): the folder the shell is in (the hook input's cwd,
// which the shell's cd moves), and the main checkout (the worktree whose .git is a directory) and the linked worktrees
// of the repository this hook runs in, as git lists them. Empty when git cannot tell: the guard then refuses reset and
// clean, because the place is not known.
function bashWhere() {
  try {
    const repo = repoAt(root);
    if (!repo) return {};
    const listed = run("git", ["worktree", "list", "--porcelain"], { cwd: repo.folder, timeout: 3000 })
      .split("\n")
      .filter((line) => line.startsWith("worktree "))
      .map((line) => realpath(line.slice("worktree ".length)));
    const isMain = (p) => fs.existsSync(path.join(p, ".git")) && fs.statSync(path.join(p, ".git")).isDirectory();
    const main = listed.find(isMain);
    if (!main) return {};
    const isFolder = (p) => {
      try {
        return fs.statSync(p).isDirectory();
      } catch {
        return false;
      }
    };
    return { cwd: input.cwd ?? root, main, linked: listed.filter((p) => p !== main), isFolder, realpath };
  } catch {
    return {};
  }
}

// Whether HEAD of the file's repository lacks the file, so it is a new migration (US-QG-07, US-DEV-07). An untracked or
// only staged file is missing from HEAD; an applied one is in it. `git ls-tree HEAD -- <file>` exits 0 and prints nothing
// for a missing path. `git cat-file -e HEAD:<file>` was the first choice, but it exits 128 for a missing path as well as
// for every git failure, so its exit status cannot tell the two apart. Any other failure (not a repository, no commit
// yet, git missing, timeout) gives no answer and counts as "in HEAD": the caller denies.
function notInHead(folder, file) {
  try {
    const listed = execFileSync("git", ["ls-tree", "HEAD", "--", file], {
      cwd: folder,
      encoding: "utf8",
      timeout: 3000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return listed === "";
  } catch {
    // Fail closed: git did not say the file is missing.
    return false;
  }
}

// Where a worktree keeps its confirmations of gate files and which branch it is on: the git directory of the worktree
// (private to it, not tracked, not shared with the other worktrees) and the full ref of HEAD, null when HEAD is detached.
// Null when git cannot tell (US-QG-07).
function confirmationSpot(folder) {
  const gitOut = (args) =>
    execFileSync("git", args, { cwd: folder, encoding: "utf8", timeout: 3000, stdio: ["ignore", "pipe", "ignore"] }).trim();
  try {
    const gitDir = gitOut(["rev-parse", "--absolute-git-dir"]);
    let branch = null;
    try {
      branch = gitOut(["symbolic-ref", "-q", "HEAD"]) || null;
    } catch {
      // A detached HEAD: symbolic-ref exits 1, and there is no branch to key the record by.
    }
    return { file: path.join(gitDir, CONFIRMATIONS_FILE), branch };
  } catch {
    return null;
  }
}

// The text of the record of confirmations, or null when it is missing or cannot be read (US-QG-07).
function readConfirmations(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

// Whether an edit of this gate file needs the human's question (US-QG-07): always when the place of the record is unknown.
function gateEditNeedsQuestion(folder, file) {
  const spot = confirmationSpot(folder);
  return !spot || needsQuestion(file, spot.branch, readConfirmations(spot.file));
}

// After an edit of a gate file went through, the file counts as confirmed on this branch (US-QG-07). Without a branch or a
// known place nothing is recorded, and the next edit asks again.
function recordGateEdit(folder, file) {
  const spot = confirmationSpot(folder);
  if (spot?.branch) fs.writeFileSync(spot.file, withConfirmation(readConfirmations(spot.file), spot.branch, file));
}

const print = (obj) => process.stdout.write(JSON.stringify(obj));
const preToolUse = (permissionDecision, permissionDecisionReason) =>
  print({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision, permissionDecisionReason } });

// Fingerprint of all code changes relative to origin/dev (committed, staged, unstaged, untracked).
function codeFingerprint() {
  const base = run("git", ["merge-base", "HEAD", "origin/dev"]).trim();
  const changed = run("git", ["diff", "--name-only", base]).split("\n");
  const untracked = run("git", ["ls-files", "--others", "--exclude-standard"]).split("\n");
  const files = [...new Set([...changed, ...untracked])].filter((f) => f && isCodePath(f)).sort();
  if (files.length === 0) return null;
  const hash = createHash("sha256");
  for (const f of files) hash.update(f).update(fs.existsSync(path.join(root, f)) ? fs.readFileSync(path.join(root, f)) : "deleted");
  return hash.digest("hex");
}
const stateFile = () => path.join(run("git", ["rev-parse", "--absolute-git-dir"]).trim(), "claude-gates-fingerprint");

// Why an edit of a baseline grows it, or null when it only shrinks it (US-QG-07). The file on disk and the tool input
// give the resulting text; an edit that cannot be placed exactly counts as growth.
function baselineEditGrowth(fileRoot, file, toolInput) {
  const abs = path.join(fileRoot, file);
  const before = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
  if (before === null) return "a new baseline file";
  const after = textAfter(toolInput, before);
  if (after === null) return "the edit cannot be placed exactly on the file";
  const { grows, reasons } = baselineGrows(file, before, after);
  return grows ? reasons.join("; ") : null;
}

const handlers = {
  "guard-edit"() {
    const target = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
    const { root: fileRoot, file } = locate(target);
    // An applied migration is immutable. A new one, not yet in HEAD, is filled in after `make migration` (US-DEV-07).
    const migration = isMigrationFile(file) && fs.existsSync(path.join(fileRoot, file));
    if (migration && !notInHead(fileRoot, file)) return preToolUse("deny", MIGRATION_REASON);
    if (path.basename(target ?? "") === CONFIRMATIONS_FILE) {
      // Only after-edit writes the record: an agent's edit of it could confirm gate files nobody was asked about (US-QG-07).
      preToolUse("ask", `${CONFIRMATIONS_FILE} records which gate files a human confirmed. Only the hook writes it (US-QG-07).`);
    } else if (isGateFile(file)) {
      if (gateEditNeedsQuestion(fileRoot, file))
        preToolUse(
          "ask",
          `${file} defines a gate, threshold or exception list. Agents change it only after a human confirms, and never to turn a red run green. A confirmed edit lets later edits of this file on this branch pass (US-QG-07).`,
        );
    } else if (isBaselineFile(file)) {
      let reason;
      try {
        reason = baselineEditGrowth(fileRoot, file, input.tool_input ?? {});
      } catch (e) {
        // Fail closed: a baseline that cannot be judged goes to a human.
        reason = `it could not be judged (${e.message.split("\n")[0]})`;
      }
      if (reason)
        preToolUse("ask", `${file} is a baseline and this change grows it: ${reason}. A baseline may only shrink; growth needs a human (US-QG-07, FR-QG-17).`);
    }
  },
  "guard-bash"() {
    const command = input.tool_input?.command ?? "";
    // Git facts are read only for a command that names git, reset or clean; the rest of the commands cost nothing (US-QG-07).
    const where = /\bgit\b|\b(reset|clean)\b/.test(command) ? bashWhere() : {};
    const verdict = judgeCommand(command, where);
    if (verdict) preToolUse(verdict.decision, verdict.reason);
  },
  "after-edit"() {
    const { root: fileRoot, file } = locate(input.tool_input?.file_path);
    // The edit went through, so a gate file edit is confirmed on this branch from now on (US-QG-07).
    if (isGateFile(file)) recordGateEdit(fileRoot, file);
    if (prettierCanFormat(file)) run("npx", ["--no-install", "prettier", "--write", "--log-level", "warn", file.slice(4)], { cwd: path.join(fileRoot, "app") });
    if (isSpecPath(file)) {
      try {
        run("node", ["app/tools/check/docs/specs/check-specs.mjs"], { cwd: fileRoot });
      } catch (e) {
        print({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: `Spec check failed after editing ${file}:\n${e.stderr || e.stdout}` } });
      }
    }
  },
  "after-bash"() {
    if (ranGates(input.tool_input?.command ?? "")) fs.writeFileSync(stateFile(), codeFingerprint() ?? "");
  },
  stop() {
    const current = codeFingerprint();
    if (!current) return;
    const last = fs.existsSync(stateFile()) ? fs.readFileSync(stateFile(), "utf8") : "";
    if (current !== last) {
      print({ systemMessage: "Heads-up: code changed since `make ci` or `make gates` last ran in this worktree. Run it before calling the work done (US-QG-07)." });
    }
  },
};

try {
  handlers[event]?.();
} catch (e) {
  // Never block the session because of a hook bug; report it on stderr (shown as a non-blocking hook error).
  process.stderr.write(`hook ${event}: ${e.message.split("\n")[0]}\n`);
}
