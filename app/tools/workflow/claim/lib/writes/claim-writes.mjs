// The writes of `make claim` (US-DEV-08), in their order: the branch (pushed first, the step that fails most often), the assignee,
// the project status and the draft PR. Each write registers its undo step before it runs (see claim-undo.mjs), so an answer lost
// on the way is undone as well (#1487).
import { setAssignee, fetchIssue } from "../claim-client.mjs";
import { branchName, ClaimRefused } from "../claim-lib.mjs";
import { collect } from "../../migration/git-view.mjs";
import { nextNumber, pad } from "../../migration/migration-lib.mjs";
import {
  commitClaim,
  deleteClaimBranch,
  handoffBody,
  openDraftPr,
  pushClaimBranch,
  setProjectStatus,
  STATUS_IN_PROGRESS,
  STATUS_TODO,
} from "./claim-steps.mjs";

/**
 * Assigns the issue to the caller (REST). The answer lists the assignees after the add; somebody else in it means the claim
 * was lost, and the caller's undo removes its own assignment again.
 */
async function assign(client, issue, login) {
  const after = await setAssignee(client, issue.number, login, true);
  const assignees = Array.isArray(after?.assignees)
    ? after.assignees
    : (await fetchIssue(client, issue.number)).assignees;
  const others = assignees.filter((a) => a.login !== login);
  if (others.length) {
    throw new ClaimRefused(
      others.map((a) => ({ text: `@${a.login} claimed #${issue.number} first` })),
    );
  }
}

/** Sets the board status; a failure is a warning and the claim goes on (P-10). True when the status was set. */
async function projectStatus(client, { issue, owner, status, item }, log) {
  try {
    await setProjectStatus(client, { issue, owner, status, item });
    log(`Project status: ${status}`);
    return true;
  } catch (e) {
    log(`WARNING: project status not set (${e.message}); set it by hand on the board`);
    return false;
  }
}

/** RESERVE_MIGRATION=1: the next free migration number, seen from origin/dev and all open PRs (issue #831). */
function reserveMigration(client, env) {
  if (env.RESERVE_MIGRATION !== "1") return undefined;
  const { taken } = collect({ cwd: client.cwd ?? process.cwd(), branch: "" });
  return pad(nextNumber({ taken }));
}

/**
 * Writes the claim. `undo` collects the undo steps as the writes happen; the caller rolls them back when this throws.
 * Returns the branch and the draft PR URL.
 */
export async function writeClaim(
  client,
  { issue, number, login, repo, owner, board, env, undo, log },
) {
  const branch = branchName(issue);
  log(`claim: pushing origin/${branch}`);
  const sha = await commitClaim(client, issue);
  undo.push({
    label: `branch origin/${branch}`,
    step: () => deleteClaimBranch(client, branch, sha),
    byHand: `git push origin --delete ${branch} (only if origin/${branch} is ${sha})`,
  });
  await pushClaimBranch(client, branch, sha);
  log(`Pushed origin/${branch}`);

  log(`claim: assigning #${number}`);
  undo.push({
    label: `assignee of #${number}`,
    step: () => setAssignee(client, number, login, false),
    byHand: `gh api -X DELETE repos/${repo}/issues/${number}/assignees -f assignees[]=${login}`,
  });
  await assign(client, issue, login);
  log(`Assigned #${number} to @${login}`);

  log("claim: setting the project status");
  undo.push({
    label: "project status",
    step: () => setProjectStatus(client, { issue, owner, status: STATUS_TODO, item: board.item }),
    byHand: `set the Status of #${number} to "${STATUS_TODO}" on the board`,
  });
  await projectStatus(client, { issue, owner, status: STATUS_IN_PROGRESS, item: board.item }, log);

  log("claim: opening the draft PR");
  const url = await openDraftPr(
    client,
    issue,
    branch,
    handoffBody(issue, branch, login, reserveMigration(client, env)),
  );
  log(`Draft PR: ${url}`);
  return { branch, url };
}
