// Waits until the CI of a pull request is final and prints the real result per job (US-DEV-13, `make ci-wait PR=<n>`).
// The judgement lives in ci-verdict.mjs (pure) and the text in ci-report.mjs; this module reads GitHub over REST, polls, and
// decides when the PR is final. A PR is final when nothing on its head is unfinished for SETTLE_MS, because a run can start
// shortly after another one finishes (ci.yml cancels and queues runs of one concurrency group).
// Usage: node ci-wait.mjs <pr number>; env CI_WAIT_TIMEOUT_MINUTES (default 60) bounds the wait.
import { fileURLToPath } from "node:url";
import { json, realClient, repoName, restList } from "../../claim/lib/claim-client.mjs";
import { report } from "./ci-report.mjs";
import {
  assess,
  exitCodeOf,
  jobsDefinedIn,
  MAX_FILES,
  problemsNow,
  pullOf,
  shortSha,
} from "./ci-verdict.mjs";

// Starting values (assumption): a full run ends within about 30 minutes, and a queued run starts within about a minute.
const POLL_MS = 30_000;
const SETTLE_MS = 60_000;
const TIMEOUT_MINUTES = 60;
const MAX_READ_FAILURES = 3;
const PER_PAGE = 100;
const MAX_PAGES = 50;

/** Every page of a REST list that wraps its items (`check_runs`, `workflow_runs`), 100 per page. */
export async function pagedKey(client, path, key) {
  const sep = path.includes("?") ? "&" : "?";
  const out = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const body = await json(client, ["api", `${path}${sep}per_page=${PER_PAGE}&page=${page}`]);
    const items = body[key] ?? [];
    out.push(...items);
    if (items.length < PER_PAGE) break;
  }
  return out;
}

/**
 * The jobs of the ci.yml at a commit; none when that commit has no workflow file (then no CI runs at all). The commit is
 * the merge commit of the PR when GitHub has one (issue 1608): a `pull_request` run uses that workflow, and the head of
 * an older branch may still define jobs that no longer run.
 */
export async function definedAt(client, repo, sha) {
  try {
    const path = `repos/${repo}/contents/.github/workflows/ci.yml?ref=${sha}`;
    const body = await json(client, ["api", path]);
    return jobsDefinedIn(Buffer.from(body.content, "base64").toString("utf8"));
  } catch (err) {
    if (/HTTP 404/.test(err.message)) return new Set();
    throw err;
  }
}

/**
 * One snapshot of the PR: the PR, its head commit, the files, the jobs of the workflow that its runs use, every check run
 * and workflow run of the head. The files are read once per head commit and the jobs once per workflow commit (`cache`).
 */
export async function readSnapshot(client, number, cache = new Map()) {
  const repo = await repoName(client);
  const pr = pullOf(await json(client, ["api", `repos/${repo}/pulls/${number}`]));
  const head = pr.head;
  if (!cache.has(`files:${head}`)) {
    const files = await restList(client, `repos/${repo}/pulls/${number}/files`, MAX_FILES);
    cache.set(
      `files:${head}`,
      files.map((f) => f.filename),
    );
  }
  const workflowSha = pr.mergeCommit ?? head;
  if (!cache.has(`defined:${workflowSha}`)) {
    cache.set(`defined:${workflowSha}`, await definedAt(client, repo, workflowSha));
  }
  const checks = `repos/${repo}/commits/${head}/check-runs?filter=all`;
  const runs = `repos/${repo}/actions/runs?head_sha=${head}`;
  const checkRuns = await pagedKey(client, checks, "check_runs");
  const workflowRuns = await pagedKey(client, runs, "workflow_runs");
  return {
    pr,
    head,
    files: cache.get(`files:${head}`),
    defined: cache.get(`defined:${workflowSha}`),
    checkRuns,
    workflowRuns,
  };
}

const progressOf = (a) => {
  if (a.status === "running") {
    const more = a.unfinished.length > 3 ? ", ..." : "";
    return `waiting for ${a.unfinished.length} unfinished (${a.unfinished.slice(0, 3).join(", ")}${more})`;
  }
  if (a.status === "computing") return "waiting until GitHub has computed whether the PR merges";
  return `every check finished, waiting ${SETTLE_MS / 1000} s more in case another run starts`;
};

/**
 * Polls until the PR is final: merged, closed, a draft (no CI run, issue 1608), conflicting, or settled (nothing unfinished for SETTLE_MS, measured
 * from the first settled poll of the head). Returns the last assessment; `status: "timeout"` when the time is up.
 * deps: read(number) -> snapshot, sleep(ms), now() -> ms, log(line), timeoutMs.
 */
export async function waitForCi(number, deps) {
  const { read, sleep, now, log, timeoutMs, pollMs = POLL_MS, settleMs = SETTLE_MS } = deps;
  const start = now();
  let quiet = null;
  let failures = 0;
  let last = "";
  for (;;) {
    let a;
    try {
      a = assess(await read(number));
      failures = 0;
    } catch (err) {
      failures += 1;
      if (failures >= MAX_READ_FAILURES) throw err;
      log(`ci-wait: GitHub API error, retrying in ${pollMs / 1000} s: ${err.message}`);
      await sleep(pollMs);
      continue;
    }
    if (["merged", "closed", "conflict", "draft"].includes(a.status)) return a;
    if (a.status === "settled") {
      if (quiet?.head !== a.head) quiet = { head: a.head, since: now() };
      if (now() - quiet.since >= settleMs) return a;
    } else {
      quiet = null;
    }
    const text = `PR #${number} on ${shortSha(a.head)}: ${progressOf(a)}`;
    if (text !== last) log(`ci-wait: ${text}`);
    last = text;
    if (now() - start >= timeoutMs) return { ...a, status: "timeout", afterMs: now() - start };
    await sleep(pollMs);
  }
}

/** Problems of CI for `make merge` (see problemsNow): one read, nothing waited for. */
export async function mergeProblems(client, number) {
  return problemsNow(assess(await readSnapshot(client, number)));
}

async function main(number) {
  if (!/^\d+$/.test(number ?? "")) {
    console.error("usage: make ci-wait PR=<number>");
    return 2;
  }
  const minutes = Number(process.env.CI_WAIT_TIMEOUT_MINUTES ?? TIMEOUT_MINUTES);
  if (!(minutes > 0)) {
    console.error("ci-wait: CI_WAIT_TIMEOUT_MINUTES must be a positive number");
    return 2;
  }
  const client = realClient();
  const cache = new Map();
  const a = await waitForCi(number, {
    read: (n) => readSnapshot(client, n, cache),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => Date.now(),
    log: (line) => console.log(line),
    timeoutMs: minutes * 60_000,
  });
  console.log(report(a));
  return exitCodeOf(a);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv[2]).catch((err) => {
    console.error(`ci-wait: ${err.message}`);
    return 1;
  });
}
