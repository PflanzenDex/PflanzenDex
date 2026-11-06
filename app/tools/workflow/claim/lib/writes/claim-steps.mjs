// Side-effect steps of `make claim` (US-DEV-08), each small and driven through the injected client.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CallTimeout, createDraftPr, PUSH_LIMIT } from "../claim-client.mjs";
import { addProjectItem, projectMeta, setItemOption, STATUS_FIELD } from "../board-client.mjs";
import { branchName, claimKey, scopeOf, storyIdOf } from "../claim-lib.mjs";

export const STATUS_IN_PROGRESS = "In Progress";
export const STATUS_TODO = "Todo";

/**
 * A git push of the claim or of its undo, under the push limit (CLAIM_PUSH_TIMEOUT_S): git push runs the pre-push hook, which runs
 * make gates, so the limit of the other calls is too short for it (#1559). A timeout names that cause and the variable to raise.
 */
async function gitPush(client, args) {
  try {
    await client.run("git", ["push", "origin", ...args], { limit: PUSH_LIMIT });
  } catch (e) {
    if (!(e instanceof CallTimeout)) throw e;
    const seconds = e.limitMs / 1000;
    throw new Error(
      `git push origin did not finish within ${seconds} s: the pre-push gates (make gates) took longer than that. Raise CLAIM_PUSH_TIMEOUT_S (now ${seconds}) before the next claim; nothing of the push is left running.`,
      { cause: e },
    );
  }
}

/**
 * Sets the project status of an issue with GraphQL (#1487). `item` is the board item read before the claim; an issue that is
 * not on the board yet is added first, by its node id. Field and option ids are read from the project at run time.
 */
export async function setProjectStatus(
  client,
  { issue, owner, status = STATUS_IN_PROGRESS, item },
) {
  const meta = await projectMeta(client, owner);
  const field = meta.fields.find((f) => f.name === STATUS_FIELD);
  const option = field?.options?.find((o) => o.name === status);
  if (!option) throw new Error(`project field "${STATUS_FIELD}" has no option "${status}"`);
  const itemId =
    item?.id ?? (await addProjectItem(client, { projectId: meta.id, contentId: issue.nodeId }));
  await setItemOption(client, {
    projectId: meta.id,
    itemId,
    fieldId: field.id,
    optionId: option.id,
  });
}

export function prTitle(issue) {
  const id = storyIdOf(issue.title);
  const subject = issue.title.replace(/^.*?·\s*/, "").replace(/^(US|FR|TE)-\S+\s*/i, "");
  const type = branchName(issue).split("/")[0];
  return `${type}(${scopeOf(issue)}): ${subject.charAt(0).toLowerCase()}${subject.slice(1)}${id ? ` (${id})` : ""}`;
}

// Opens the draft PR over REST (no GraphQL point) with the Handoff as body file. The folder of that file goes again, also when the call fails.
export async function openDraftPr(client, issue, branch, body) {
  const dir = mkdtempSync(path.join(tmpdir(), "claim-"));
  try {
    const file = path.join(dir, "body.md");
    writeFileSync(file, body);
    return await createDraftPr(client, {
      title: prTitle(issue),
      head: branch,
      base: "dev",
      bodyFile: file,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Draft PR text; the "## Handoff" section is what the next person (or agent) reads first. */
export function handoffBody(issue, branch, login, migrationNumber) {
  return [
    `Closes #${issue.number}`,
    "",
    "## What and why",
    "",
    `Claimed with \`make claim\` by @${login} for ${claimKey(issue)}: ${issue.title}.`,
    "",
    "## Handoff",
    "",
    "Keep this section current; whoever takes over reads it first.",
    "",
    `- **Task:** ${issue.url} (branch \`${branch}\`)`,
    "- **Done:** nothing yet, only the claim",
    "- **Missing:** everything in the acceptance criteria of the issue",
    "- **Verification:** not run yet (`make ci`)",
    ...(migrationNumber === undefined
      ? []
      : [
          `- **Migration number:** ${migrationNumber} (reserved by \`make claim\`; \`make migration\` uses it)`,
        ]),
    "- **Next steps:** `make worktree BRANCH=" + branch + "`, then `spec-to-tests`",
    "",
    "## Test evidence",
    "",
    "Not yet.",
    "",
    "## AI involvement",
    "",
    "Claim, branch and draft PR created by `make claim`.",
    "",
  ].join("\n");
}

/** The claim commit: an empty commit on origin/dev, made without touching the working tree. Local only; returns its sha. */
export async function commitClaim(client, issue) {
  const tree = (await client.run("git", ["rev-parse", "origin/dev^{tree}"])).trim();
  const message = `chore(${scopeOf(issue)}): claim ${claimKey(issue)} (#${issue.number})`;
  return (await client.run("git", ["commit-tree", tree, "-p", "origin/dev", "-m", message])).trim();
}

/** Pushes the claim commit as a new branch. A branch that exists already makes the push fail: it is never overwritten. */
export async function pushClaimBranch(client, branch, sha) {
  await gitPush(client, [`${sha}:refs/heads/${branch}`]);
}

/**
 * Deletes the claim branch, but only while origin still points at our claim commit: a branch that somebody else pushed under
 * the same name is left alone (returns the note for the log). The check also covers a push that reached origin although its
 * answer was lost (a timeout).
 */
export async function deleteClaimBranch(client, branch, sha) {
  const listed = (
    await client.run("git", ["ls-remote", "--heads", "origin", `refs/heads/${branch}`])
  ).trim();
  if (!listed) return "already gone";
  if (listed.split("\t")[0] !== sha) return `origin/${branch} is not our claim commit; left alone`;
  await gitPush(client, ["--delete", branch]);
  return undefined;
}
