#!/usr/bin/env node
// `make gate-plan FILES="<gate file> ..."` (US-QG-07): records the gate files that the branch of this worktree will change,
// in the git directory of the worktree (the plan record, see gate-confirmations.mjs). The plan grants nothing: the edit guard
// still asks the owner at every edit of a gate file. A gate test may be named: it asks no question and make merge reviews it.
// The Makefile passes FILES as the raw environment variable GATE_PLAN_FILES, so a value is data and never a shell command. Paths
// are relative to the top of the worktree, which is the folder this runs in. Round 2 (issue 2554): a listed gate file that
// already differs from origin/dev, and that no owner allowed, is reported on stderr and logged; the plan is still written
// (warn, exit 0), because the plan never grants a change.
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  CONFIRMATIONS_FILE,
  normalizePaths,
  PLAN_FILE,
  planWith,
  unconfirmedChanged,
} from "./gate-confirmations.mjs";
import { appendDecision } from "./gate-log.mjs";
import { keyOf, sealRead } from "./gate-seal.mjs";
import { asksBeforeEdit } from "./rules.mjs";

const git = (args) =>
  execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const readText = (file) => (fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null);

// Whether a file differs from origin/dev: a change in the working tree or the index, or a new file that git does not track.
// When origin/dev cannot be read the answer is unknown, and the file is reported as possibly changed (warn, not block).
function differsFromDev(file) {
  const diff = spawnSync("git", ["diff", "--quiet", "origin/dev", "--", file], {
    encoding: "utf8",
    stdio: ["ignore", "ignore", "pipe"],
  });
  if (diff.status !== 0) return true;
  return git(["ls-files", "--others", "--exclude-standard", "--", file]) !== "";
}

// What the plan says back (US-QG-07): the files it names, that nothing is allowed, and, once, that the gate tests it names
// ask no question in the hook and are reviewed when the PR merges.
function report(branch, files) {
  const asking = files.filter(asksBeforeEdit);
  const tests = files.filter((file) => !asksBeforeEdit(file));
  const lines = [`gate-plan: ${branch} plans ${files.join(", ")}.`];
  if (asking.length > 0)
    lines.push("Nothing is allowed: the first edit of each file still asks a human.");
  if (tests.length > 0)
    lines.push(
      `Test files ask no question in the hook (${tests.join(", ")}): make merge refuses a PR that changes one, so a human reviews it there.`,
    );
  return `${lines.join(" ")}\n`;
}

function run() {
  const files = normalizePaths((process.env.GATE_PLAN_FILES ?? "").split(/\s+/).filter(Boolean));
  let branch;
  try {
    branch = git(["symbolic-ref", "-q", "HEAD"]);
  } catch {
    throw new Error("HEAD is detached: a plan belongs to a branch");
  }
  const dir = git(["rev-parse", "--absolute-git-dir"]);
  const common = git(["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  const planFile = path.join(dir, PLAN_FILE);
  const text = planWith(readText(planFile), branch, files);
  const confirmed = sealRead(path.join(dir, CONFIRMATIONS_FILE), keyOf(common));
  const warned = unconfirmedChanged(files, differsFromDev, confirmed, branch);
  for (const file of warned)
    appendDecision(common, {
      branch: branch.replace(/^refs\/heads\//, ""),
      file,
      decision: "warned",
      source: "gate-plan",
      actor: null,
      mode: null,
      agent: null,
    });
  if (warned.length > 0)
    process.stderr.write(
      `gate-plan: warning: ${warned.join(", ")} already differ from origin/dev, and no owner allowed them. The plan grants nothing; the edit guard still asks the owner at each edit (issue 2554).\n`,
    );
  fs.writeFileSync(planFile, text);
  return report(branch, files);
}

try {
  process.stdout.write(run());
} catch (error) {
  process.stderr.write(`gate-plan: ${error.message.split("\n")[0]}\n`);
  process.exitCode = 1;
}
