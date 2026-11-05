// Thin wrapper around gh and git for the claim tools (US-DEV-08). Tests inject a fake with the same shape:
// { run(cmd, args) -> Promise<string> }. Every gh read uses --json, a REST route or the GraphQL helper below, never text output.
// Repository, issue, pull request and assignee calls use REST: REST has its own budget and spends no GraphQL point, so the
// claim, worktree and board tools keep working when the GraphQL budget is used up (FR-DEV-10, #1412). The board is in board-client.mjs.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { claimKey } from "./claim-lib.mjs";

const exec = promisify(execFile);
const memo = new WeakMap(); // client -> lookups that are read once per run

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

/** One GraphQL call through `gh api graphql`; a GraphQL error (also inside an HTTP 200 body) throws with its message. */
export async function graphql(client, query, vars = {}) {
  const args = ["api", "graphql", "-f", `query=${query}`];
  for (const [name, value] of Object.entries(vars)) {
    if (value !== undefined && value !== null) args.push("-F", `${name}=${value}`);
  }
  const body = await json(client, args);
  if (body.errors?.length) throw new Error(body.errors[0].message);
  return body.data;
}

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

/** Up to `max` items of a paged REST list (100 per page); `path` may already carry a query string. */
export async function restList(client, path, max) {
  const sep = path.includes("?") ? "&" : "?";
  const out = [];
  for (let page = 1; out.length < max; page += 1) {
    const batch = await json(client, ["api", `${path}${sep}per_page=100&page=${page}`]);
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out.slice(0, max);
}

/** The fields the claim rules read, in the shape `gh issue view --json` gave them (state in upper case). */
export const issueOf = (i) => ({
  number: i.number,
  title: i.title,
  state: String(i.state ?? "").toUpperCase(),
  labels: i.labels ?? [],
  assignees: i.assignees ?? [],
  url: i.html_url,
  updatedAt: i.updated_at,
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

/** The 300 newest pull requests (the bound of the claim check, as before), REST. */
export async function fetchPrs(client) {
  const list = await restList(
    client,
    await repoPath(client, "pulls?state=all&sort=created&direction=desc"),
    300,
  );
  return list.map(prOf);
}

/** Branch names on origin (without refs/heads/), main and dev excluded. */
export async function fetchBranches(client) {
  const out = await client.run("git", ["ls-remote", "--heads", "origin"]);
  return out
    .split("\n")
    .map((l) => l.split("\t")[1]?.replace("refs/heads/", ""))
    .filter((b) => b && b !== "main" && b !== "dev");
}

/**
 * All open issues, newest first, pull requests left out (the REST issue list holds both); which of them are work items of
 * a release is decided by the board (`workItems`). Up to 500 entries are read, as before (4 pages for 338 open issues).
 */
export async function fetchOpenIssues(client) {
  const list = await restList(
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

/** Adds (add = true) or removes the assignee `login` of an issue (REST, no GraphQL point). */
export async function setAssignee(client, n, login, add) {
  await client.run("gh", [
    "api",
    "-X",
    add ? "POST" : "DELETE",
    await repoPath(client, `issues/${n}/assignees`),
    "-f",
    `assignees[]=${login}`,
  ]);
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
