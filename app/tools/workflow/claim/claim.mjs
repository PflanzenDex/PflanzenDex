// `make claim ISSUE=<n>` (US-DEV-08): claim a story before working on it, so nobody builds it twice.
// Refuses (exit 1) when the issue has an assignee, a PR references it or an origin branch carries its story ID or it is labelled needs-triage (FR-DEV-10). Otherwise: assignee, project status, branch <type>/<story-id>-<slug>, draft PR with "## Handoff".
// Repository, issue, PR and assignee calls are REST and the board is one lookup of this issue, so a claim survives an exhausted GraphQL budget (FR-DEV-10, #1412): what cannot be written is a warning.
// Speed (#1487): the reads that do not depend on each other run at once, the branch list comes from the refs the fetch has just
// updated, the assignee answer shows the assignees (no second read), and the status is two GraphQL writes.
// Safety (#1487): every GitHub or git call has a time limit (CLAIM_TIMEOUT_S, starting value 60 s), each undo step is tried three
// times, and a step that still fails prints the command to run by hand (claim-undo.mjs, claim-writes.mjs). A git push of the claim
// and of its undo has a limit of its own (CLAIM_PUSH_TIMEOUT_S, starting value 300 s): it runs make gates (#1559). A timed-out call
// ends its process group, so no gate run is left behind.
// RESERVE_MIGRATION=1 also reserves the next migration number in the Handoff (issue #831).
// Waive merged PRs only (follow-up work on a story): ALLOW_PRIOR_WORK=1. Everything else needs a human decision.
import { fileURLToPath } from "node:url";
import {
  fetchBranches,
  fetchIssue,
  fetchPrs,
  me,
  PUSH_LIMIT,
  realClient,
  repoName,
} from "./lib/claim-client.mjs";
import { boardItemOf } from "./lib/board-client.mjs";
import { checkFree, ClaimRefused, refusalReport } from "./lib/claim-lib.mjs";
import { rollBack } from "./lib/writes/claim-undo.mjs";
import { writeClaim } from "./lib/writes/claim-writes.mjs";
import { preflight, PreflightFailed } from "./claim-preflight.mjs";
import { PRIORITY_HINT } from "../actions/project-status/project-status-lib.mjs";

export { ClaimRefused };

export const DEFAULT_TIMEOUT_S = 60; // assumption: a starting value; a GitHub call here takes well under a second
// assumption: a starting value; measured 104 s on the devbox (#1559), where git push runs the pre-push hook (make gates)
export const DEFAULT_PUSH_TIMEOUT_S = 300;

/**
 * The time limits of `make claim` from the environment: CLAIM_TIMEOUT_S for every call, CLAIM_PUSH_TIMEOUT_S for the claim push
 * and its undo. Throws a RangeError when a value is not a positive number of seconds.
 */
export function timeoutsOf(env) {
  const millis = (name, fallback) => {
    const seconds = env[name] ? Number(env[name]) : fallback;
    if (!(seconds > 0)) throw new RangeError(`${name} must be a positive number of seconds`);
    return seconds * 1000;
  };
  return {
    timeoutMs: millis("CLAIM_TIMEOUT_S", DEFAULT_TIMEOUT_S),
    limits: { [PUSH_LIMIT]: millis("CLAIM_PUSH_TIMEOUT_S", DEFAULT_PUSH_TIMEOUT_S) },
  };
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
 * Atomic claim: preflight first, then the reads, then the writes (branch, assignee, status, draft PR). Any failure undoes what
 * was written; a re-run starts clean.
 */
export async function claim(
  client,
  number,
  { env = {}, log = console.log, preflight: check = preflight, retryDelayMs = 1000 } = {},
) {
  const started = Date.now();
  log("claim: fetching origin");
  await client.run("git", ["fetch", "--quiet", "--prune", "origin"]);
  await check(client);
  const [login, repo] = await Promise.all([me(client), repoName(client)]);
  log(`claim: reading #${number}, the pull requests, the branches and the board`);
  const [board, found, prs, branches] = await Promise.all([
    readBoard(client, repo, number, log),
    fetchIssue(client, number),
    fetchPrs(client),
    fetchBranches(client),
  ]);
  const issue = board.item?.typ ? { ...found, typ: board.item.typ } : found;
  checkFree({ issue, prs, branches, number, login, allowPrior: env.ALLOW_PRIOR_WORK === "1" });
  const undo = [];
  try {
    const { branch, url } = await writeClaim(client, {
      issue,
      number,
      login,
      repo,
      owner: repo.split("/")[0],
      board,
      env,
      undo,
      log,
    });
    warnNoPriority(board, number, log);
    log(`Next: make worktree BRANCH=${branch}`);
    log(`claim: done in ${Math.round((Date.now() - started) / 1000)} s`);
    return { branch, url };
  } catch (e) {
    await rollBack(undo, log, retryDelayMs);
    throw e;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const number = Number(process.argv[2]);
  if (!Number.isInteger(number) || number <= 0) {
    console.error("usage: make claim ISSUE=<issue number>");
    process.exit(2);
  }
  let limits;
  try {
    limits = timeoutsOf(process.env);
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
  claim(realClient(limits), number, { env: process.env }).catch((e) => {
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
