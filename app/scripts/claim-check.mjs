// Claim checks by branch name (US-DEV-08), used by `make worktree` and the pre-push hook.
//   node claim-check.mjs worktree <branch>   refuses unclaimed or foreign stories
//   node claim-check.mjs pre-push            reads the hook's stdin, refuses pushes to foreign stories
// Opt-out, always explicit: SKIP_CLAIM_CHECK=1 (make worktree BRANCH=x SKIP_CLAIM_CHECK=1).
// A check that cannot reach GitHub warns and lets go: offline work must stay possible.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { findIssuesByKey, me, realClient } from "./claim-client.mjs";
import { keyOfBranch } from "./claim-lib.mjs";

/** Verdict for one branch: { ok, message }. mode "worktree" also demands a claim, "push" only warns. */
export async function checkBranch(client, branch, mode) {
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
    const text = `${id} (#${issue.number}) is not claimed; run: make claim ISSUE=${issue.number}`;
    return mode === "worktree"
      ? { ok: false, message: text }
      : { ok: true, message: `warning: ${text}` };
  }
  return { ok: true, message: null };
}

export function pushedBranches(stdin) {
  return stdin
    .split("\n")
    .map((l) => l.split(" "))
    .filter(
      ([, localSha, remoteRef]) => remoteRef?.startsWith("refs/heads/") && !/^0+$/.test(localSha),
    )
    .map(([, , remoteRef]) => remoteRef.replace("refs/heads/", ""));
}

export async function run(client, [mode, arg], stdin, log = console.error) {
  const branches = mode === "pre-push" ? pushedBranches(stdin) : [arg];
  let ok = true;
  for (const branch of branches) {
    const verdict = await checkBranch(client, branch, mode === "pre-push" ? "push" : "worktree");
    if (verdict.message) log(`claim: ${verdict.message}`);
    ok &&= verdict.ok;
  }
  return ok;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.env.SKIP_CLAIM_CHECK === "1") {
    console.error("claim: check skipped (SKIP_CLAIM_CHECK=1)");
    process.exit(0);
  }
  const [mode, arg] = process.argv.slice(2);
  if (!["worktree", "pre-push"].includes(mode) || (mode === "worktree" && !arg)) {
    console.error("usage: claim-check.mjs worktree <branch> | pre-push (stdin from the hook)");
    process.exit(2);
  }
  const stdin = mode === "pre-push" ? readFileSync(0, "utf8") : "";
  const ok = await run(realClient(), [mode, arg], stdin);
  process.exit(ok ? 0 : 1);
}
