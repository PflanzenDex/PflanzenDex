// Claim check by branch name (US-DEV-08), used by `make worktree`:
//   node claim-check.mjs worktree <branch>   refuses unclaimed or foreign issues
// Only a branch with an issue number (issue-<n>) is checked: a story ID may belong to many issues, so a branch with only a story ID passes.
// There is no push check: who may push to a branch is decided by GitHub, not by a local hook.
// Opt-out, always explicit: SKIP_CLAIM_CHECK=1 (make worktree BRANCH=x SKIP_CLAIM_CHECK=1).
// A check that cannot reach GitHub warns and lets go: offline work must stay possible.
// The agent may run as a GitHub App (US-DEV-08, issue 2556): its bot cannot be an assignee, so an assignee counts as ours when it is
// the claimant (PFLANZENDEX_CLAIM_ASSIGNEE, else the caller) or the caller itself.
import { findIssuesByKey, realClient } from "./lib/claim-client.mjs";
import { claimant, me } from "./lib/identity/claim-identity.mjs";
import { keyOfBranch } from "./lib/claim-lib.mjs";
import { isEntryPoint } from "../../check/shared/entry-point.mjs";

/** Verdict for one branch: { ok, message }. `env` carries PFLANZENDEX_CLAIM_ASSIGNEE (tests pass their own). */
export async function checkBranch(client, branch, env = process.env) {
  const key = keyOfBranch(branch);
  if (!key) return { ok: true, message: null };
  if (!key.startsWith("issue-"))
    return {
      ok: true,
      message: `claim check skipped for ${branch}: the branch carries no issue number (a story ID may belong to many issues); nothing to check`,
    };
  const id = key.toUpperCase();
  let issue, viewer, human;
  try {
    // The issue list and the identities are independent: one round trip (#1487). A bot without the setting throws here: the check skips.
    [issue, viewer, human] = await Promise.all([
      findIssuesByKey(client, key).then((found) => found[0]),
      me(client),
      claimant(client, env),
    ]);
  } catch (e) {
    return { ok: true, message: `claim check skipped for ${id}: ${e.message.split("\n")[0]}` };
  }
  if (!issue) return { ok: true, message: `no open issue for ${id}; nothing to check` };
  const mine = (login) => login === human || login === viewer;
  const others = issue.assignees.filter((a) => !mine(a.login));
  if (others.length) {
    const who = others.map((a) => `@${a.login}`).join(", ");
    return {
      ok: false,
      message: `${id} (#${issue.number}) belongs to ${who}; talk to them first (make board)`,
    };
  }
  if (issue.assignees.length === 0) {
    return {
      ok: false,
      message: `${id} (#${issue.number}) is not claimed; run: make claim ISSUE=${issue.number}`,
    };
  }
  return { ok: true, message: null };
}

export async function run(client, branch, log = console.error, env = process.env) {
  const verdict = await checkBranch(client, branch, env);
  if (verdict.message) log(`claim: ${verdict.message}`);
  return verdict.ok;
}

if (isEntryPoint(import.meta.url)) {
  if (process.env.SKIP_CLAIM_CHECK === "1") {
    console.error("claim: check skipped (SKIP_CLAIM_CHECK=1)");
    process.exit(0);
  }
  const [mode, branch] = process.argv.slice(2);
  if (mode !== "worktree" || !branch) {
    console.error("usage: claim-check.mjs worktree <branch>");
    process.exit(2);
  }
  process.exit((await run(realClient(), branch)) ? 0 : 1);
}
