#!/usr/bin/env node
// Entry point for all Claude Code hooks of this repo (US-QG-07, US-DEV-02).
// Usage from .claude/settings.json: node .claude/hooks/run.mjs <guard-edit|guard-bash|after-edit|after-bash|stop>
// A hook must never hang or break a session: every step has a time limit and unexpected errors end with exit 0.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
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
const relative = (file) => path.relative(root, path.resolve(root, file ?? "")).split(path.sep).join("/");
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

const handlers = {
  "guard-edit"() {
    const file = relative(input.tool_input?.file_path ?? input.tool_input?.notebook_path);
    if (isMigrationFile(file) && fs.existsSync(path.join(root, file))) return preToolUse("deny", MIGRATION_REASON);
    if (isGateFile(file)) {
      preToolUse("ask", `${file} defines a gate, threshold or exception list. Agents change it only after a human confirms, and never to turn a red run green (US-QG-07).`);
    }
  },
  "guard-bash"() {
    const verdict = judgeCommand(input.tool_input?.command ?? "");
    if (verdict) preToolUse(verdict.decision, verdict.reason);
  },
  "after-edit"() {
    const file = relative(input.tool_input?.file_path);
    if (prettierCanFormat(file)) run("npx", ["--no-install", "prettier", "--write", "--log-level", "warn", file.slice(4)], { cwd: path.join(root, "app") });
    if (isSpecPath(file)) {
      try {
        run("node", ["app/scripts/check-specs.mjs"]);
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
