// Side-effect steps of `make claim` (US-DEV-08), each small and driven through the injected client.
import { json } from "./claim-client.mjs";
import { branchName, claimKey, scopeOf, storyIdOf } from "./claim-lib.mjs";

export const PROJECT_NUMBER = "2"; // "PflanzenDex Roadmap"
export const STATUS_FIELD = "Status";
export const STATUS_IN_PROGRESS = "In Progress";

/** Sets the project status of an issue; reads item, field and option ids at run time. */
export async function setProjectStatus(client, issueUrl, owner, status = STATUS_IN_PROGRESS) {
  const item = await json(client, [
    "project",
    "item-add",
    PROJECT_NUMBER,
    "--owner",
    owner,
    "--url",
    issueUrl,
    "--format",
    "json",
  ]);
  const fields = await json(client, [
    "project",
    "field-list",
    PROJECT_NUMBER,
    "--owner",
    owner,
    "--format",
    "json",
  ]);
  const field = fields.fields.find((f) => f.name === STATUS_FIELD);
  const option = field?.options?.find((o) => o.name === status);
  if (!option) throw new Error(`project field "${STATUS_FIELD}" has no option "${status}"`);
  const project = await json(client, [
    "project",
    "view",
    PROJECT_NUMBER,
    "--owner",
    owner,
    "--format",
    "json",
  ]);
  await client.run("gh", [
    "project",
    "item-edit",
    "--id",
    item.id,
    "--project-id",
    project.id,
    "--field-id",
    field.id,
    "--single-select-option-id",
    option.id,
  ]);
}

export function prTitle(issue) {
  const id = storyIdOf(issue.title);
  const subject = issue.title.replace(/^.*?·\s*/, "").replace(/^(US|FR|TE)-\S+\s*/i, "");
  const type = branchName(issue).split("/")[0];
  return `${type}(${scopeOf(issue)}): ${subject.charAt(0).toLowerCase()}${subject.slice(1)}${id ? ` (${id})` : ""}`;
}

/** Draft PR text; the "## Handoff" section is what the next person (or agent) reads first. */
export function handoffBody(issue, branch, login) {
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

/** Empty commit on origin/dev without touching the working tree, pushed as a new branch only. */
export async function pushClaimBranch(client, issue, branch) {
  const tree = (await client.run("git", ["rev-parse", "origin/dev^{tree}"])).trim();
  const message = `chore(${scopeOf(issue)}): claim ${claimKey(issue)} (#${issue.number})`;
  const sha = (
    await client.run("git", ["commit-tree", tree, "-p", "origin/dev", "-m", message])
  ).trim();
  await client.run("git", ["push", "origin", `${sha}:refs/heads/${branch}`]);
  return sha;
}
