// The evidence of check runs (US-DEV-10): the result of one job from its runs, and the code-scanning checks of a head
// (CodeQL, analyze (<language>)) with their result. Pure; ci-verdict.mjs turns it into the verdict.
import { runIdOf } from "./ci-reuse.mjs";

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
