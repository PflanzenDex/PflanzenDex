// Claim check by branch name (US-DEV-08), used by `make worktree`:
//   node claim-check.mjs worktree <branch>   refuses unclaimed or foreign stories
// There is no push check: who may push to a branch is decided by GitHub, not by a local hook.
// Opt-out, always explicit: SKIP_CLAIM_CHECK=1 (make worktree BRANCH=x SKIP_CLAIM_CHECK=1).
// A check that cannot reach GitHub warns and lets go: offline work must stay possible.
import { fileURLToPath } from "node:url";
import { findIssuesByKey, me, realClient } from "./claim-client.mjs";
import { keyOfBranch } from "./claim-lib.mjs";

/** Verdict for one branch: { ok, message }. */
export async function checkBranch(client, branch) {
  const key = keyOfBranch(branch);
  if (!key) return { ok: true, message: null };
  const id = key.toUpperCase();
  let issue, login;
  try {
    issue = (await findIssuesByKey(client, key))[0];
    login = await me(client);
  } catch (e) {
    return { ok: true, message: `claim check skipped for ${id}: ${e.message.split("\n")[0]}` };
  }
  if (!issue) return { ok: true, message: `no open issue for ${id}; nothing to check` };
  const others = issue.assignees.filter((a) => a.login !== login);
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

export async function run(client, branch, log = console.error) {
  const verdict = await checkBranch(client, branch);
  if (verdict.message) log(`claim: ${verdict.message}`);
  return verdict.ok;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
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
