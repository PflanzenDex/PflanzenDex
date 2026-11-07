#!/usr/bin/env node
// `make gate-plan FILES="<gate file> ..."` (US-QG-07): records the gate files that the branch of this worktree will change,
// in the git directory of the worktree (claude-gate-plan.json, see gate-confirmations.mjs). It confirms nothing: the first
// edit of each file still asks a human, and that question names the whole plan. A gate test may be named: it asks no question
// and make merge reviews it (US-QG-07). The Makefile passes FILES as the raw environment variable GATE_PLAN_FILES, so a value
// is data and never a shell command. Paths are relative to the top of the worktree, which is the folder this runs in.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { PLAN_FILE, normalizePaths, planWith } from "./gate-confirmations.mjs";
import { asksBeforeEdit } from "./rules.mjs";

const git = (args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

// What the plan says back (US-QG-07): the files it names, that nothing is confirmed, and, once, that the gate tests it names
// ask no question in the hook and are reviewed when the PR merges.
function report(branch, files) {
  const asking = files.filter(asksBeforeEdit);
  const tests = files.filter((file) => !asksBeforeEdit(file));
  const lines = [`gate-plan: ${branch} plans ${files.join(", ")}.`];
  if (asking.length > 0) lines.push("Nothing is confirmed: the first edit of each file still asks a human.");
  if (tests.length > 0)
    lines.push(`Test files ask no question in the hook (${tests.join(", ")}): make merge refuses a PR that changes one, so a human reviews it there.`);
  return `${lines.join(" ")}\n`;
}

function plan() {
  const files = normalizePaths((process.env.GATE_PLAN_FILES ?? "").split(/\s+/).filter(Boolean));
  let branch;
  try {
    branch = git(["symbolic-ref", "-q", "HEAD"]);
  } catch {
    throw new Error("HEAD is detached: a plan belongs to a branch");
  }
  const file = path.join(git(["rev-parse", "--absolute-git-dir"]), PLAN_FILE);
  const text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
  fs.writeFileSync(file, planWith(text, branch, files));
  return report(branch, files);
}

try {
  process.stdout.write(plan());
} catch (error) {
  process.stderr.write(`gate-plan: ${error.message.split("\n")[0]}\n`);
  process.exitCode = 1;
}
