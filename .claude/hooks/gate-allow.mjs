#!/usr/bin/env node
// `make gate-allow FILES="<gate file> ..."`, for the owner only (US-QG-07, issue 2554): allows gate files for the rest of the
// branch of this worktree. Later edits of them pass without a question. The command runs only from the owner's own terminal:
// it refuses when CLAUDECODE is set in its environment or when its input or output is not a terminal (issue 2554, round 2).
// The Bash guard refuses the target for agents too (rules.mjs). The Makefile passes FILES as the raw environment variable
// GATE_PLAN_FILES, so a value is data and never a shell command. The record is sealed with the repository key (gate-seal.mjs).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIRMATIONS_FILE, normalizePaths, withConfirmations } from "./gate-confirmations.mjs";
import { appendDecision } from "./gate-log.mjs";
import { keyOf, sealRead, sealWrite } from "./gate-seal.mjs";
import { asksBeforeEdit } from "./rules.mjs";

const git = (args) =>
  execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

// The allow of the owner. Private to this file (round 3, d-146): an import gets nothing, only the command line runs it. A file
// that asks no question (a gate test, or any other path) is refused, and nothing is written then.
function allowGate({ common, dir, branch, files }) {
  if (files.length === 0) throw new Error('no gate file is named (FILES="<gate file> ...")');
  const notAsking = files.filter((file) => !asksBeforeEdit(file));
  if (notAsking.length > 0) throw new Error(`not a gate file that asks: ${notAsking.join(", ")}`);
  const key = keyOf(common);
  const record = path.join(dir, CONFIRMATIONS_FILE);
  // A record that does not verify is replaced: the branches it allowed ask again (fail closed).
  sealWrite(record, key, withConfirmations(sealRead(record, key), branch, files));
  const short = branch.replace(/^refs\/heads\//, "");
  for (const file of files)
    appendDecision(common, {
      branch: short,
      file,
      decision: "allowed",
      source: "gate-allow",
      actor: null,
      mode: null,
      agent: null,
    });
  return `gate-allow: ${branch} allows ${files.join(", ")} for the rest of the branch. Later edits of them pass without a question (issue 2554).\n`;
}

function namedFiles() {
  const args = process.argv.slice(2);
  const words = args.length > 0 ? args : (process.env.GATE_PLAN_FILES ?? "").split(/\s+/);
  return normalizePaths(words.filter(Boolean));
}

// Only the owner's own terminal may allow: no agent session (CLAUDECODE) and a terminal on input and output (issue 2554).
function fromOwnerTerminal() {
  return !process.env.CLAUDECODE && process.stdin.isTTY === true && process.stdout.isTTY === true;
}

function main() {
  if (!fromOwnerTerminal())
    throw new Error(
      "runs only in the owner's own terminal: CLAUDECODE is set, or the input or the output is not a terminal (issue 2554)",
    );
  const files = namedFiles();
  let branch;
  try {
    branch = git(["symbolic-ref", "-q", "HEAD"]);
  } catch {
    throw new Error("HEAD is detached: an allow belongs to a branch");
  }
  const dir = git(["rev-parse", "--absolute-git-dir"]);
  const common = git(["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  return allowGate({ common, dir, branch, files });
}

// Runs only as the command line of this file. An import of this module runs nothing and exports nothing.
const isCommandLine =
  process.argv[1] !== undefined &&
  fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
if (isCommandLine) {
  try {
    process.stdout.write(main());
  } catch (error) {
    process.stderr.write(`gate-allow: ${error.message.split("\n")[0]}\n`);
    process.exitCode = 1;
  }
}
