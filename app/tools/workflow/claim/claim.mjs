// `make claim ISSUE=<n>` (US-DEV-08): claim a story before working on it, so nobody builds it twice.
// Refuses (exit 1) when the issue has an assignee, a PR references it or an origin branch carries its story ID or it is labelled needs-triage (FR-DEV-10). Otherwise: assignee, project status, branch <type>/<story-id>-<slug>, draft PR with "## Handoff".
// Repository, issue, PR and assignee calls are REST and the board is one lookup of this issue, so a claim survives an exhausted GraphQL budget (FR-DEV-10, #1412): what cannot be written is a warning.
// RESERVE_MIGRATION=1 also reserves the next migration number in the Handoff (issue #831).
// Waive merged PRs only (follow-up work on a story): ALLOW_PRIOR_WORK=1. Everything else needs a human decision.
import { fileURLToPath } from "node:url";
import {
  fetchBranches,
  fetchIssue,
  fetchPrs,
  me,
  realClient,
  repoName,
  setAssignee,
} from "./lib/claim-client.mjs";
import { boardItemOf } from "./lib/board-client.mjs";
import { branchName, findConflicts, refusalReport } from "./lib/claim-lib.mjs";
import { preflight, PreflightFailed } from "./claim-preflight.mjs";
import { collect } from "./migration/git-view.mjs";
import { nextNumber, pad } from "./migration/migration-lib.mjs";
import { PRIORITY_HINT } from "../actions/project-status/project-status-lib.mjs";
import {
  handoffBody,
  openDraftPr,
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

async function assertFree(client, number, { env, login, typ }) {
  const [found, prs, branches] = await Promise.all([
    fetchIssue(client, number),
    fetchPrs(client),
    fetchBranches(client),
  ]);
  const issue = typ ? { ...found, typ } : found;
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

/** Assigns the issue to the caller (REST); if somebody else was faster in the meantime, steps back. */
async function assign(client, issue, login) {
  await setAssignee(client, issue.number, login, true);
  const after = await fetchIssue(client, issue.number);
  const others = after.assignees.filter((a) => a.login !== login);
  if (others.length) {
    await setAssignee(client, issue.number, login, false);
    throw new ClaimRefused(
      others.map((a) => ({ text: `@${a.login} claimed #${issue.number} first` })),
    );
  }
}

/** Sets the board status; a failure is a warning and the claim goes on (P-10). True when the status was set. */
async function projectStatus(client, { url, owner, status }, log) {
  try {
    await setProjectStatus(client, url, owner, status);
    log(`Project status: ${status}`);
    return true;
  } catch (e) {
    log(`WARNING: project status not set (${e.message}); set it by hand on the board`);
    return false;
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

/** RESERVE_MIGRATION=1: the next free migration number, seen from origin/dev and all open PRs (issue #831). */
function reserveMigration(client, env) {
  if (env.RESERVE_MIGRATION !== "1") return undefined;
  const { taken } = collect({ cwd: client.cwd ?? process.cwd(), branch: "" });
  return pad(nextNumber({ taken }));
}

/**
 * The board item of this issue, read once: its Typ decides the branch type, its priority the warning. A failed lookup is
 * reported and the labels decide instead; nothing is swallowed (P-10).
 */
async function readBoard(client, repo, number, log) {
  try {
    return { item: await boardItemOf(client, { repo, number }) };
  } catch (e) {
    log(`Warning: could not read the board type of #${number} (${e.message}); using its labels`);
    return { error: e };
  }
}

/** Warning only, never a failure: the claim is done; a failed lookup is reported, not swallowed (P-10). */
function warnNoPriority({ item, error }, number, log) {
  if (error) return log(`Warning: could not check the priority of #${number} (${error.message})`);
  if (item && !item.priority && !item.epic) log(`Warning: #${number} has ${PRIORITY_HINT}`);
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
  const repo = await repoName(client);
  const owner = repo.split("/")[0];
  const board = await readBoard(client, repo, number, log);
  const issue = await assertFree(client, number, { env, login, typ: board.item?.typ });
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
    undo.push([`assignee of #${number}`, () => setAssignee(client, number, login, false)]);
    log(`Assigned #${number} to @${login}`);
    if (await projectStatus(client, { url: issue.url, owner, status: STATUS_IN_PROGRESS }, log))
      undo.push(["project status", () => setProjectStatus(client, issue.url, owner, STATUS_TODO)]);
    const url = await openDraftPr(
      client,
      issue,
      branch,
      handoffBody(issue, branch, login, reserveMigration(client, env)),
    );
    log(`Draft PR: ${url}`);
    warnNoPriority(board, number, log);
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
      console.error(refusalReport(number, e));
    } else {
      console.error(`claim failed: ${e.message}`);
    }
    process.exit(1);
  });
}
