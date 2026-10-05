// `make claim ISSUE=<n>` (US-DEV-08): claim a story before working on it, so nobody builds it twice.
// Refuses (exit 1) when the issue has an assignee, a PR references it or an origin branch carries its
// story ID. Otherwise: assignee, project status, branch <type>/<story-id>-<slug>, draft PR with "## Handoff".
// Waive merged PRs only (follow-up work on a story): ALLOW_PRIOR_WORK=1. Everything else needs a human decision.
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchBranches, fetchIssue, fetchPrs, me, realClient } from "./lib/claim-client.mjs";
import { branchName, findConflicts } from "./lib/claim-lib.mjs";
import { preflight, PreflightFailed } from "./claim-preflight.mjs";
import { PRIORITY_HINT } from "../project-status/project-status-lib.mjs";
import { missingPriority } from "../project-status/project-status.mjs";
import {
  handoffBody,
  prTitle,
  pushClaimBranch,
  setProjectStatus,
  STATUS_IN_PROGRESS,
  STATUS_TODO,
} from "./lib/claim-steps.mjs";

export class ClaimRefused extends Error {
  constructor(findings) {
    super(findings.map((f) => `  - ${f.text}`).join("\n"));
    this.findings = findings;
  }
}

async function assertFree(client, number, env, login) {
  const [issue, prs, branches] = await Promise.all([
    fetchIssue(client, number),
    fetchPrs(client),
    fetchBranches(client),
  ]);
  if (issue.state !== "OPEN")
    throw new ClaimRefused([{ text: `issue #${number} is ${issue.state}` }]);
  // The caller's own assignment is a half claim of an earlier run: continue, do not refuse.
  const findings = findConflicts({
    issue,
    prs,
    branches,
    allowPrior: env.ALLOW_PRIOR_WORK === "1",
  }).filter((f) => !(f.kind === "assignee" && f.login === login));
  const branch = branchName(issue);
  if (branches.includes(branch)) findings.push({ text: `branch origin/${branch} exists` });
  if (findings.length) throw new ClaimRefused(findings);
  return issue;
}

/** Assigns the issue to the caller; if somebody else was faster in the meantime, steps back. */
async function assign(client, issue, login) {
  await client.run("gh", ["issue", "edit", String(issue.number), "--add-assignee", "@me"]);
  const after = await fetchIssue(client, issue.number);
  const others = after.assignees.filter((a) => a.login !== login);
  if (others.length) {
    await client.run("gh", ["issue", "edit", String(issue.number), "--remove-assignee", "@me"]);
    throw new ClaimRefused(
      others.map((a) => ({ text: `@${a.login} claimed #${issue.number} first` })),
    );
  }
}

async function projectStatus(client, issue, status, log) {
  try {
    const owner = (
      await client.run("gh", ["repo", "view", "--json", "owner", "-q", ".owner.login"])
    ).trim();
    await setProjectStatus(client, issue.url, owner, status);
    log(`Project status: ${status}`);
  } catch (e) {
    log(`WARNING: project status not set (${e.message}); set it by hand on the board`);
  }
}

/** Runs the undo steps in reverse, each best effort, so the original error stays the one reported. */
async function rollBack(undo, log) {
  for (const [label, step] of undo.reverse()) {
    try {
      await step();
      log(`Rolled back: ${label}`);
    } catch (e) {
      log(`WARNING: could not roll back "${label}" (${e.message}); undo it by hand`);
    }
  }
}

/** Warning only, never a failure: the claim is done; a failed lookup is reported, not swallowed (P-10). */
async function warnNoPriority(client, number, log) {
  try {
    if ((await missingPriority(client, [number])).length)
      log(`Warning: #${number} has ${PRIORITY_HINT}`);
  } catch (e) {
    log(`Warning: could not check the priority of #${number}: ${e.message}`);
  }
}

/**
 * Atomic claim: preflight first, then the branch is pushed (the step that fails most often), then the
 * assignee, status and draft PR. Any failure undoes what was written; a re-run starts clean.
 */
export async function claim(
  client,
  number,
  { env = {}, log = console.log, preflight: check = preflight } = {},
) {
  await client.run("git", ["fetch", "--quiet", "--prune", "origin"]);
  await check(client);
  const login = await me(client);
  const issue = await assertFree(client, number, env, login);
  const branch = branchName(issue);
  const undo = [];
  try {
    await pushClaimBranch(client, issue, branch);
    undo.push([
      `branch origin/${branch}`,
      () => client.run("git", ["push", "origin", "--delete", branch]),
    ]);
    log(`Pushed origin/${branch}`);
    await assign(client, issue, login);
    undo.push([
      `assignee of #${number}`,
      () => client.run("gh", ["issue", "edit", String(number), "--remove-assignee", "@me"]),
    ]);
    log(`Assigned #${number} to @${login}`);
    await projectStatus(client, issue, STATUS_IN_PROGRESS, log);
    undo.push(["project status", () => projectStatus(client, issue, STATUS_TODO, log)]);
    const file = path.join(mkdtempSync(path.join(tmpdir(), "claim-")), "body.md");
    writeFileSync(file, handoffBody(issue, branch, login));
    const url = (
      await client.run("gh", [
        "pr",
        "create",
        "--draft",
        "--base",
        "dev",
        "--head",
        branch,
        "--title",
        prTitle(issue),
        "--body-file",
        file,
      ])
    ).trim();
    log(`Draft PR: ${url}`);
    await warnNoPriority(client, number, log);
    log(`Next: make worktree BRANCH=${branch}`);
    return { branch, url };
  } catch (e) {
    await rollBack(undo, log);
    throw e;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const number = Number(process.argv[2]);
  if (!Number.isInteger(number) || number <= 0) {
    console.error("usage: make claim ISSUE=<issue number>");
    process.exit(2);
  }
  claim(realClient(), number, { env: process.env }).catch((e) => {
    if (e instanceof PreflightFailed) {
      console.error(
        `claim not started for #${number}: preflight failed, nothing was written.\n${e.message}`,
      );
    } else if (e instanceof ClaimRefused) {
      console.error(`claim refused for #${number}: someone may already work on it.\n${e.message}`);
      console.error("Ask the owner, or let the claim go stale (make board) before taking over.");
    } else {
      console.error(`claim failed: ${e.message}`);
    }
    process.exit(1);
  });
}
