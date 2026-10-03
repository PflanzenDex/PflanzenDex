// Thin wrapper around gh and git for the claim tools (US-DEV-08). Tests inject a fake with the same shape:
// { run(cmd, args) -> Promise<string> }. Every gh read uses --json, never text output.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { claimKey } from "./claim-lib.mjs";

const exec = promisify(execFile);

export function realClient({ cwd = process.cwd() } = {}) {
  return {
    async run(cmd, args) {
      const { stdout } = await exec(cmd, args, { cwd, maxBuffer: 32 * 1024 * 1024 });
      return stdout;
    },
  };
}

export async function json(client, args) {
  return JSON.parse(await client.run("gh", args));
}

export const me = async (client) =>
  (await client.run("gh", ["api", "user", "-q", ".login"])).trim();

export const fetchIssue = (client, n) =>
  json(client, [
    "issue",
    "view",
    String(n),
    "--json",
    "number,title,state,labels,assignees,url,milestone",
  ]);

export const fetchPrs = (client) =>
  json(client, [
    "pr",
    "list",
    "--state",
    "all",
    "--limit",
    "300",
    "--json",
    "number,title,body,state,isDraft,headRefName,mergedAt,author,commits",
  ]);

/** Branch names on origin (without refs/heads/), main and dev excluded. */
export async function fetchBranches(client) {
  const out = await client.run("git", ["ls-remote", "--heads", "origin"]);
  return out
    .split("\n")
    .map((l) => l.split("\t")[1]?.replace("refs/heads/", ""))
    .filter((b) => b && b !== "main" && b !== "dev");
}

/** Open issues of a milestone that are stories or enablers. */
export async function fetchWorkItems(client, milestone) {
  const issues = await json(client, [
    "issue",
    "list",
    "--state",
    "open",
    "--limit",
    "500",
    "--milestone",
    milestone,
    "--json",
    "number,title,labels,assignees,updatedAt,url",
  ]);
  return issues.filter((i) => i.labels.some((l) => ["story", "enabler"].includes(l.name)));
}

export async function openMilestone(client) {
  const all = await json(client, ["api", "repos/{owner}/{repo}/milestones?state=open"]);
  const first = [...all].sort((a, b) => a.number - b.number)[0];
  if (!first) throw new Error("no open milestone");
  return first.title;
}

/** Open issues (stories, enablers) that share a claim key; the search is done here, not by GitHub. */
export async function findIssuesByKey(client, key) {
  const issues = await json(client, [
    "issue",
    "list",
    "--state",
    "open",
    "--limit",
    "500",
    "--json",
    "number,title,labels,assignees,url",
  ]);
  return issues.filter((i) => claimKey(i) === key);
}
