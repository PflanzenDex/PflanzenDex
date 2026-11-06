// Reuses a green heavy CI job for the same PR head commit (US-QG-02, #404). Editing a PR title or body and
// `ready_for_review` start a new CI run on an unchanged commit; without this the app suite (`app-*` jobs) ran again (and the
// shared concurrency group cancelled the run that was still going: 23 of 100 runs on 2026-10-08).
// Safe by construction: only a `success` of the same job on the same head commit is reused. Anything else (none,
// failed, cancelled, still running after the wait) answers `none`, and the job runs in full.
// Usage (ci.yml, job `reuse`): node ci-reuse.mjs <job name>... with GH_TOKEN, GITHUB_REPOSITORY, HEAD_SHA,
// GITHUB_RUN_ID and GITHUB_OUTPUT set. Writes `<job name>=success|none` per job.
// The check-run evidence that `make ci-wait` judges (evidenceOf, scanRowsOf, US-DEV-13) is here too, next to runIdOf.
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const POLL_SECONDS = 30;
// Each `app-*` job has a 15 minute timeout; a little more covers queueing (starting value, assumption).
const WAIT_SECONDS = 20 * 60;

/** Run id from a check run's details URL (`…/actions/runs/<run id>/job/<job id>`), or null. */
export function runIdOf(checkRun) {
  const match = /\/actions\/runs\/(\d+)\//.exec(checkRun.details_url ?? checkRun.html_url ?? "");
  return match ? match[1] : null;
}

/**
 * Decision over the check runs of one job on one commit, leaving out the current run:
 * `pending` while another run of the job is queued or running, `success` when the latest finished run that did
 * real work succeeded, otherwise `none`. Skipped and cancelled runs did no work and never count.
 */
export function decide(checkRuns, currentRunId) {
  const others = checkRuns.filter((c) => runIdOf(c) !== String(currentRunId));
  if (others.some((c) => c.status !== "completed")) return "pending";
  const finished = others
    .filter((c) => c.conclusion !== "skipped" && c.conclusion !== "cancelled")
    .sort((a, b) => String(b.completed_at).localeCompare(String(a.completed_at)));
  return finished[0]?.conclusion === "success" ? "success" : "none";
}

const NO_WORK = new Set(["skipped", "cancelled"]);
const SCAN_FAILED = new Set(["failure", "timed_out", "action_required", "startup_failure"]);
const doneAt = (c) => Date.parse(c.completed_at ?? "") || 0;

export const isActionsCheck = (c) => (c.app?.slug ?? "github-actions") === "github-actions";

// Code scanning: CodeQL's default setup reports `CodeQL` from the GitHub Advanced Security app, and the advanced workflow of
// codeql.yml reports `analyze (<language>)` from GitHub Actions. Neither is a CI job and ci-status does not wait for them,
// but a failed analysis blocks the merge (PRIN-019), so they are judged too. A PR may have none (docs-only PRs).
const isScanCheck = (c) =>
  (c.name === "CodeQL" && c.app?.slug === "github-advanced-security") ||
  (/^analyze \(.+\)$/.test(c.name) && isActionsCheck(c));

/**
 * The result of one job from its check runs (all runs of that job on the head commit, any order): the latest finished run
 * that did work. A skipped run did no work, and a cancelled run was superseded by a newer run of the same commit, so
 * either one counts only when no other run finished (then it is the result). Null when nothing finished at all.
 */
export function evidenceOf(runs) {
  const done = runs.filter((r) => r.status === "completed").sort((a, b) => doneAt(b) - doneAt(a));
  const pick =
    done.find((r) => !NO_WORK.has(r.conclusion)) ?? done.find((r) => r.conclusion === "cancelled");
  // A check run without an actions run (CodeQL links to its check run) is named by its check run id.
  return pick
    ? { conclusion: pick.conclusion, run: runIdOf(pick) ?? String(pick.id), at: pick.completed_at }
    : null;
}

/**
 * One row per code-scanning check on the head (isScanCheck): its latest result, and a problem when that result failed.
 * Neutral, skipped and cancelled results are no problem; a check that is still running is `running`.
 */
export function scanRowsOf(checkRuns) {
  const names = [...new Set(checkRuns.filter(isScanCheck).map((c) => c.name))];
  return names.map((name) => {
    const runs = checkRuns.filter((c) => c.name === name && isScanCheck(c));
    const ev = evidenceOf(runs);
    const unfinished = runs.some((r) => r.status !== "completed");
    const result = ev?.conclusion ?? (unfinished ? "running" : "skipped");
    return {
      job: name,
      required: false,
      scanning: true,
      result,
      run: ev?.run ?? null,
      at: ev?.at ?? null,
      problem: SCAN_FAILED.has(result) ? `${name}: ${result}` : null,
    };
  });
}

async function fetchCheckRuns({ repo, sha, name, token }) {
  const url = `https://api.github.com/repos/${repo}/commits/${sha}/check-runs?check_name=${encodeURIComponent(name)}&filter=all&per_page=100`;
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status} for check runs of ${name}`);
  return (await res.json()).check_runs;
}

/** Waits while another run of the job is still going, then decides; `none` after the wait or on any API error. */
export async function resolve(
  name,
  env,
  { load = fetchCheckRuns, sleep, waitSeconds = WAIT_SECONDS } = {},
) {
  const pause = sleep ?? ((s) => new Promise((r) => setTimeout(r, s * 1000)));
  for (let waited = 0; ; waited += POLL_SECONDS) {
    let state;
    try {
      state = decide(await load({ ...env, name }), env.runId);
    } catch (err) {
      console.log(`ci-reuse: ${name}: ${err.message}; running the job in full`);
      return "none";
    }
    if (state !== "pending") return state;
    if (waited >= waitSeconds) return "none";
    console.log(`ci-reuse: ${name}: another run is still going, waiting ${POLL_SECONDS} s`);
    await pause(POLL_SECONDS);
  }
}

async function main(names) {
  const env = {
    repo: process.env.GITHUB_REPOSITORY,
    sha: process.env.HEAD_SHA,
    token: process.env.GH_TOKEN,
    runId: process.env.GITHUB_RUN_ID,
  };
  for (const name of names) {
    const state = await resolve(name, env);
    console.log(`ci-reuse: ${name} on ${env.sha}: ${state}`);
    appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${state}\n`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
