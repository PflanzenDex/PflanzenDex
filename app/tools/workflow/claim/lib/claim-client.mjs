// The claim tools' reads and writes on the repository, issues, pull requests and assignees (US-DEV-08). REST only (FR-DEV-10, #1412):
// REST has its own budget and spends no GraphQL point, so the claim, worktree and board tools keep working when the GraphQL budget
// is used up. The board is in board-client.mjs; the transport (gh and git calls, paging, time limit) in github-calls.mjs.
import { claimKey } from "./claim-lib.mjs";
import { json, restPages } from "./github-calls.mjs";

export { graphql, graphqlIds, json, realClient, restList, restPages } from "./github-calls.mjs";

const memo = new WeakMap(); // client -> lookups that are read once per run

// The fetch refspec `git clone` writes: every branch lands in refs/remotes/origin/*.
const STANDARD_FETCH = "+refs/heads/*:refs/remotes/origin/*";
const NOT_A_FEATURE = new Set(["main", "dev", "HEAD"]);

export const me = async (client) =>
  (await client.run("gh", ["api", "user", "-q", ".login"])).trim();

/** "owner/name" of the repository of the checkout (GH_REPO in CI); one REST call per run. */
export function repoName(client) {
  if (!memo.has(client)) memo.set(client, new Map());
  const lookups = memo.get(client);
  if (!lookups.has("repo"))
    lookups.set(
      "repo",
      client
        .run("gh", ["api", "repos/{owner}/{repo}", "--jq", ".full_name"])
        .then((out) => out.trim()),
    );
  return lookups.get("repo");
}

const repoPath = async (client, tail) => `repos/${await repoName(client)}/${tail}`;

/** The fields the claim rules read, in the shape `gh issue view --json` gave them (state in upper case). nodeId is the GraphQL id (board). */
export const issueOf = (i) => ({
  number: i.number,
  title: i.title,
  state: String(i.state ?? "").toUpperCase(),
  labels: i.labels ?? [],
  assignees: i.assignees ?? [],
  url: i.html_url,
  updatedAt: i.updated_at,
  nodeId: i.node_id ?? null,
});

/** A pull request in the shape `gh pr list --json` gave: state OPEN, CLOSED or MERGED, mergedAt, isDraft, headRefName. */
export const prOf = (p) => {
  const mergedAt = p.merged_at ?? null;
  return {
    number: p.number,
    title: p.title,
    body: p.body ?? "",
    state: mergedAt ? "MERGED" : String(p.state ?? "").toUpperCase(),
    isDraft: Boolean(p.draft),
    headRefName: p.head?.ref ?? "",
    mergedAt,
  };
};

export async function fetchIssue(client, n) {
  return issueOf(await json(client, ["api", await repoPath(client, `issues/${n}`)]));
}

/** The 300 newest pull requests (the bound of the claim check, as before), REST, the three pages at once. */
export async function fetchPrs(client) {
  const list = await restPages(
    client,
    await repoPath(client, "pulls?state=all&sort=created&direction=desc"),
    300,
  );
  return list.map(prOf);
}

/**
 * Branch names on origin (without refs/heads/), main and dev excluded. With the standard fetch refspec they come from the
 * remote-tracking refs that `git fetch --prune origin` has just updated: no network call. With any other refspec (a
 * single-branch clone) origin is asked with ls-remote, because the remote-tracking refs would then miss branches.
 */
export async function fetchBranches(client) {
  const names = (await trackedBranches(client)) ?? (await remoteBranches(client));
  return names.filter((b) => b && !NOT_A_FEATURE.has(b));
}

/** Branch names from refs/remotes/origin/*, or null when the fetch refspec is not the standard one. */
async function trackedBranches(client) {
  let refspecs;
  try {
    refspecs = await client.run("git", ["config", "--get-all", "remote.origin.fetch"]);
  } catch {
    return null; // git config exits 1 when the key is not set: the fallback asks origin
  }
  if (!refspecs.split("\n").includes(STANDARD_FETCH)) return null;
  const out = await client.run("git", [
    "for-each-ref",
    "--format=%(refname)",
    "refs/remotes/origin/",
  ]);
  return out
    .split("\n")
    .filter(Boolean)
    .map((ref) => ref.replace("refs/remotes/origin/", ""));
}

/** Branch names asked from origin with ls-remote. */
async function remoteBranches(client) {
  const out = await client.run("git", ["ls-remote", "--heads", "origin"]);
  return out.split("\n").map((l) => l.split("\t")[1]?.replace("refs/heads/", ""));
}

/**
 * All open issues, newest first, pull requests left out (the REST issue list holds both); which of them are work items of
 * a release is decided by the board (`workItems`). Up to 500 entries are read, as before, the pages at once (#1487).
 */
export async function fetchOpenIssues(client) {
  const list = await restPages(
    client,
    await repoPath(client, "issues?state=open&sort=created&direction=desc"),
    500,
  );
  return list.filter((i) => !i.pull_request).map(issueOf);
}

/** Open issues (stories, enablers) that share a claim key; the search is done here, not by GitHub. */
export async function findIssuesByKey(client, key) {
  return (await fetchOpenIssues(client)).filter((i) => claimKey(i) === key);
}

/**
 * Adds (add = true) or removes the assignee `login` of an issue (REST, no GraphQL point). GitHub answers with the issue as it
 * is after the change, so the claim sees the assignees without a second read; null when the answer is empty.
 */
export async function setAssignee(client, n, login, add) {
  const out = await client.run("gh", [
    "api",
    "-X",
    add ? "POST" : "DELETE",
    await repoPath(client, `issues/${n}/assignees`),
    "-f",
    `assignees[]=${login}`,
  ]);
  return out.trim() ? JSON.parse(out) : null;
}

/** Creates an issue with labels in `repo` ("owner/name", REST). Returns its number and URL. */
export async function createIssueRest(client, { repo, title, body, labels }) {
  const out = await json(client, [
    "api",
    "-X",
    "POST",
    `repos/${repo}/issues`,
    "-f",
    `title=${title}`,
    "-f",
    `body=${body}`,
    ...labels.flatMap((label) => ["-f", `labels[]=${label}`]),
  ]);
  return { number: out.number, url: out.html_url };
}

/** Opens a draft pull request from `head` into `base`, the body read from `bodyFile` (REST); returns its URL. */
export async function createDraftPr(client, { title, head, base, bodyFile }) {
  const out = await json(client, [
    "api",
    "-X",
    "POST",
    await repoPath(client, "pulls"),
    "-f",
    `title=${title}`,
    "-f",
    `head=${head}`,
    "-f",
    `base=${base}`,
    "-F",
    "draft=true",
    "-F",
    `body=@${bodyFile}`,
  ]);
  return out.html_url;
}
