#!/usr/bin/env node
// The release check of the blocking accessibility tier (US-QG-02, owner decision d-190, issue 2666): a release refuses unless the
// last run of `nightly-a11y` on the dev head that the release merges is green. The nightly job sets the commit status
// `nightly-a11y` on the sha it tested (scheduled runs use `dev`, so the status on that sha is the record). Pure `judge` below;
// the CLI reads the combined status of the sha through `gh api`:
//   node release-check.mjs [sha]     (default: the second parent of HEAD, the dev head of a release merge commit)
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const CONTEXT = "nightly-a11y";
export const START_COMMAND = "gh workflow run nightly.yml --ref dev";

/**
 * The verdict for one head from its combined status (`gh api repos/<repo>/commits/<sha>/status`): the latest status of the
 * context `nightly-a11y` decides. success passes; failure and error refuse as red; pending or no status refuses as no run.
 */
export function judge(combinedStatus, sha) {
  const statuses = Array.isArray(combinedStatus?.statuses) ? combinedStatus.statuses : [];
  const latest = statuses.find((status) => status.context === CONTEXT);
  if (latest?.state === "success") return { ok: true, message: `${CONTEXT} is green on ${sha}` };
  if (latest?.state === "failure" || latest?.state === "error")
    return {
      ok: false,
      message: `${CONTEXT} is red on ${sha} (${latest.state}): fix the finding, then run ${START_COMMAND}`,
    };
  const why = latest?.state === "pending" ? "a run is still pending" : "no run exists";
  return {
    ok: false,
    message: `${CONTEXT}: ${why} on this head ${sha}; dispatch the workflow Nightly on dev: ${START_COMMAND}`,
  };
}

/** The sha to judge: the argument when given (a full or short hex id), else the dev head that HEAD merges. */
export function shaToJudge(argument, parentsLine) {
  if (argument !== undefined && argument !== "") {
    if (!/^[0-9a-f]{7,40}$/.test(argument))
      throw new Error(`release-check: "${argument}" is no commit id`);
    return { sha: argument, note: "" };
  }
  // `git rev-list --parents -n 1 HEAD` prints "<commit> <parent> [<parent>...]".
  const parents = (parentsLine ?? "").trim().split(/\s+/).slice(1);
  if (parents.length >= 2) return { sha: parents[1], note: "" };
  return {
    sha: undefined,
    note: "HEAD has one parent (a hotfix on main, not a release merge): nothing to compare with dev, no nightly check",
  };
}

/** The repository of the GitHub API path: GITHUB_REPOSITORY, else the repository of `gh repo view`. */
export function repoOf(env, ghView) {
  if (env.GITHUB_REPOSITORY) return env.GITHUB_REPOSITORY;
  return ghView();
}

function gitParents() {
  return execFileSync("git", ["rev-list", "--parents", "-n", "1", "HEAD"], { encoding: "utf8" });
}

function ghView() {
  return execFileSync("gh", ["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"], {
    encoding: "utf8",
  }).trim();
}

function combinedStatus(repo, sha) {
  const text = execFileSync("gh", ["api", `repos/${repo}/commits/${sha}/status`], {
    encoding: "utf8",
  });
  return JSON.parse(text);
}

/** The command line: exit 0 when the check passes or there is no release merge to check, 1 when it refuses. */
export function main(argv, env = process.env) {
  const picked = shaToJudge(argv[0], gitParents());
  if (picked.sha === undefined) {
    process.stdout.write(`release-check: ${picked.note}\n`);
    return 0;
  }
  const repo = repoOf(env, ghView);
  const verdict = judge(combinedStatus(repo, picked.sha), picked.sha);
  process.stdout.write(`release-check: ${verdict.message}\n`);
  return verdict.ok ? 0 : 1;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(
      `release-check: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
