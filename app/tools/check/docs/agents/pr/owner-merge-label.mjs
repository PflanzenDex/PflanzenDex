// US-DEV-13 (issue 1774): the label owner-merge marks a pull request that changes a gate file. `make merge` refuses such a
// pull request (app/tools/workflow/merge-pr.mjs, the same test), so only the owner merges it, and the owner finds it with
// `label:owner-merge`. The workflow owner-merge-label.yml runs this on every push to a pull request into dev or main and sets
// or removes the label, so the label follows the files of the head. The script comes from the base branch, never from the
// code of the pull request.
//   REST_PR=<n> node app/tools/check/docs/agents/pr/owner-merge-label.mjs    (make owner-merge-label PR=<n>)
// Exit 0 when the label is set or removed as the files say, 1 when a GitHub call fails, 2 when REST_PR is not a PR number.
// The label, its colour and its description come from app/config/project/issue-taxonomy.json (pullRequestLabels); the label is
// created when it is missing. GitHub lists at most 3000 files of a pull request: at that cap the label is set, because a gate
// file may be cut off from the list.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isGateFile } from "../../../../../../.claude/hooks/rules.mjs";

const TAXONOMY = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../../config/project/issue-taxonomy.json",
);
const LABEL = "owner-merge";
const FILE_CAP = 3000;
const PR_NUMBER = /^[1-9][0-9]{0,8}$/;

/** The gate files among the changed files of a pull request: the test make merge uses (isGateFile of rules.mjs). */
export function gateFilesOf(files) {
  return files.filter((file) => isGateFile(file));
}

function labelEntry() {
  const entry = JSON.parse(readFileSync(TAXONOMY, "utf8")).pullRequestLabels?.find(
    (candidate) => candidate.label === LABEL,
  );
  if (!entry) throw new Error(`issue-taxonomy.json has no pullRequestLabels entry "${LABEL}"`);
  return entry;
}

// One gh call without a shell. `code` is the HTTP status that gh names in its message, when it names one.
function gh(args) {
  const out = spawnSync("gh", args, { encoding: "utf8" });
  const stderr = out.stderr || out.error?.message || "";
  return {
    ok: out.status === 0,
    stdout: out.stdout ?? "",
    message: stderr.trim().split("\n")[0] || "no answer",
    code: stderr.match(/HTTP (\d{3})/)?.[1],
  };
}

function changedFiles(number) {
  const r = gh([
    "api",
    "--paginate",
    `repos/{owner}/{repo}/pulls/${number}/files`,
    "--jq",
    ".[].filename",
  ]);
  if (!r.ok) throw new Error(`could not read the files of PR #${number}: ${r.message}`);
  return r.stdout.split("\n").filter(Boolean);
}

// The label exists with its colour before it is added. A 422 means a run that finished first created it.
function ensureLabel(entry) {
  const found = gh(["api", `repos/{owner}/{repo}/labels/${entry.label}`]);
  if (found.ok) return;
  if (found.code !== "404")
    throw new Error(`could not read the label ${entry.label}: ${found.message}`);
  const created = gh([
    "api",
    "-X",
    "POST",
    "repos/{owner}/{repo}/labels",
    "-f",
    `name=${entry.label}`,
    "-f",
    `color=${entry.color}`,
    "-f",
    `description=${entry.description}`,
  ]);
  if (!created.ok && created.code !== "422")
    throw new Error(`could not create the label ${entry.label}: ${created.message}`);
}

function setLabel(number, entry) {
  ensureLabel(entry);
  const r = gh([
    "api",
    "-X",
    "POST",
    `repos/{owner}/{repo}/issues/${number}/labels`,
    "-f",
    `labels[]=${entry.label}`,
  ]);
  if (!r.ok)
    throw new Error(`could not add the label ${entry.label} to PR #${number}: ${r.message}`);
}

// A 404 means the label is not on the PR: there is nothing to remove, and that is no failure.
function removeLabel(number, entry) {
  const r = gh([
    "api",
    "-X",
    "DELETE",
    `repos/{owner}/{repo}/issues/${number}/labels/${entry.label}`,
  ]);
  if (!r.ok && r.code !== "404")
    throw new Error(`could not remove the label ${entry.label} from PR #${number}: ${r.message}`);
  return r.ok;
}

function main(env) {
  const number = env.REST_PR ?? "";
  if (!PR_NUMBER.test(number)) {
    console.error(`owner-merge-label: REST_PR is not a pull request number: "${number}"`);
    return 2;
  }
  try {
    const files = changedFiles(number);
    const gates = gateFilesOf(files);
    const capped = files.length >= FILE_CAP;
    const entry = labelEntry();
    if (gates.length > 0 || capped) {
      setLabel(number, entry);
      const why =
        gates.length > 0
          ? `changes gate files (${gates.join(", ")})`
          : `lists ${FILE_CAP} files or more, so a gate file may be cut off`;
      console.log(`owner-merge-label: PR #${number} ${why}: label ${entry.label} set`);
    } else {
      const removed = removeLabel(number, entry);
      console.log(
        `owner-merge-label: PR #${number} changes no gate file: label ${entry.label} ${removed ? "removed" : "was not set"}`,
      );
    }
    return 0;
  } catch (error) {
    console.error(`owner-merge-label: ${error.message}`);
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exit(main(process.env));
