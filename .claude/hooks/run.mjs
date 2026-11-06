#!/usr/bin/env node
// Entry point for all Claude Code hooks of this repo (US-QG-07, US-DEV-02).
// Usage from .claude/settings.json: node .claude/hooks/run.mjs <guard-edit|guard-bash|after-edit|after-bash|stop>
// A hook must never hang or break a session: every step has a time limit and unexpected errors end with exit 0.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { baselineGrows, isBaselineFile, textAfter } from "./baseline-growth.mjs";
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
    const { root: fileRoot, file } = locate(input.tool_input?.file_path ?? input.tool_input?.notebook_path);
    if (isMigrationFile(file) && fs.existsSync(path.join(fileRoot, file))) return preToolUse("deny", MIGRATION_REASON);
    if (isGateFile(file)) {
      preToolUse("ask", `${file} defines a gate, threshold or exception list. Agents change it only after a human confirms, and never to turn a red run green (US-QG-07).`);
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
    const verdict = judgeCommand(input.tool_input?.command ?? "");
    if (verdict) preToolUse(verdict.decision, verdict.reason);
  },
  "after-edit"() {
    const { root: fileRoot, file } = locate(input.tool_input?.file_path);
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
