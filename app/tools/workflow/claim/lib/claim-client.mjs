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
  json(client, ["issue", "view", String(n), "--json", "number,title,state,labels,assignees,url"]);

export const fetchPrs = (client) =>
  json(client, [
    "pr",
    "list",
    "--state",
    "all",
    "--limit",
    "300",
    "--json",
    "number,title,body,state,isDraft,headRefName,mergedAt",
  ]);

/** Branch names on origin (without refs/heads/), main and dev excluded. */
export async function fetchBranches(client) {
  const out = await client.run("git", ["ls-remote", "--heads", "origin"]);
  return out
    .split("\n")
    .map((l) => l.split("\t")[1]?.replace("refs/heads/", ""))
    .filter((b) => b && b !== "main" && b !== "dev");
}

/** All open issues; which of them are work items of a release is decided by the board (`workItems`). */
export const fetchOpenIssues = (client) =>
  json(client, [
    "issue",
    "list",
    "--state",
    "open",
    "--limit",
    "500",
    "--json",
    "number,title,labels,assignees,updatedAt,url",
  ]);

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
