// The verdict on the CI of one pull request, as a pure function of one snapshot (US-DEV-13, `make ci-wait PR=<n>`).
// A text edit starts a CI run that skips the heavy jobs (reused from an earlier run, see ci-reuse.mjs),
// and its `ci-status` is green while the full run is still going. A draft has no CI run at all (issue 1608). So the verdict is per job, from every check run on the
// head commit: the latest real result of each job (a skipped or cancelled run is no result). The jobs that count are the
// ones that the head's own workflow defines and that its path filter and base branch require (ci.yml, `changes`).
import { evidenceOf, isActionsCheck, scanRowsOf } from "./ci-reuse.mjs";

export const MAX_FILES = 3000; // the REST list of changed files stops at 3000 entries

// The path filters of the `changes` job in ci.yml, as the same regular expressions (a test reads ci.yml and checks that the
// text is there). The `changes` job diffs against the base commit of the event, this reading against the PR's files: they
// differ only when the base moved after the PR branched off.
export const PATHS = {
  app: /^(app\/|Makefile$|\.github\/|\.nvmrc$|\.claude\/hooks\/)/,
  oneScreen:
    /^(app\/packages\/(web|e2e)\/|app\/packages\/api\/perf\/(demo-seed|catalog-seed)\/|app\/config\/gates\/|Makefile$|\.github\/)/,
  docs: /^(docs\/|\.agents\/|\.claude\/skills\/|\.markdownlint-cli2\.jsonc$)|\.md$/,
  // The `ui` output (issue 1608): an app path that is neither workflow or dev tooling, a hook, documentation nor Markdown.
  // A changed file counts when it matches this (a negative lookahead, as the PCRE grep of the `changes` job reads it).
  ui: /^(?!(app\/tools\/workflow\/|app\/tools\/dev\/|\.claude\/hooks\/|docs\/|\.agents\/|\.claude\/skills\/)|.*\.md$)(app\/|Makefile$|\.github\/|\.nvmrc$|\.claude\/hooks\/)/,
};

// The jobs of ci.yml that this reading judges, in workflow order. `ci-status` aggregates them: it is shown, not judged.
// `app-coverage`, `one-screen` and `a11y-routes` are the jobs that `results` replaced (issue 1608); they stay for a head whose
// ci.yml still defines them. A job that the head's workflow does not define is never required.
export const JOBS = [
  "changes",
  "layout",
  "dependency-review",
  "metadata",
  "reuse",
  "app-gates",
  "app-tests",
  "app-tests-web",
  "results",
  "app-ui",
  "ds-snapshots",
  "lighthouse",
  "docs-gates",
  "audit",
  "e2e",
  "app-coverage",
  "one-screen",
  "a11y-routes",
];
const CI_NAMES = new Set([...JOBS, "ci-status"]);
const APP_JOBS = ["app-gates", "app-tests", "app-tests-web", "results", "app-coverage"];
const UI_APP_JOBS = ["app-ui", "ds-snapshots", "lighthouse"];
const UI_JOBS = ["one-screen", "a11y-routes"];
const MAIN_ONLY_JOBS = ["audit", "e2e"];
export const NOT_IN_WORKFLOW = "not in workflow";
const QUIET = new Set(["success", "skipped", "cancelled", "running", NOT_IN_WORKFLOW]);

export const shortSha = (sha) => String(sha ?? "").slice(0, 8);

/** The jobs that the workflow of the head commit defines (keys directly under `jobs:`; a head may predate a job). */
export function jobsDefinedIn(ciYml) {
  const body = ciYml.split(/^jobs:\s*$/m)[1] ?? "";
  return new Set([...body.matchAll(/^ {2}([a-z][a-z0-9-]*):\s*$/gm)].map((m) => m[1]));
}

/**
 * The jobs that the workflow of the head requires for this PR: its path filter and base branch decide, and a job the
 * head's workflow does not define is never required. A draft requires nothing: it runs no CI (issue 1608).
 */
export function requiredJobs({ files, base, draft, defined }) {
  if (draft) return new Set();
  // With the maximum number of files the filters cannot be told apart, so every filter counts as matched.
  const all = files.length >= MAX_FILES;
  const hit = (re) => all || files.some((f) => re.test(f));
  const jobs = ["changes", "layout", "dependency-review", "metadata"];
  if (hit(PATHS.app)) jobs.push(...APP_JOBS);
  if (hit(PATHS.ui)) jobs.push(...UI_APP_JOBS);
  if (hit(PATHS.oneScreen)) jobs.push(...UI_JOBS);
  if (hit(PATHS.docs)) jobs.push("docs-gates");
  if (base === "main") jobs.push(...MAIN_ONLY_JOBS);
  return new Set(jobs.filter((j) => defined.has(j)));
}

function problemOf(job, result, required) {
  if (required) {
    if (result === "success") return null;
    const why = result === "never ran" ? "never ran, but ci.yml requires it for this PR" : result;
    return `${job}: ${why}`;
  }
  return QUIET.has(result) ? null : `${job}: ${result}`;
}

/** One row per judged job: its result, the run that gave it and the problem it causes (null when none). */
export function rowsOf(checkRuns, required, defined) {
  return JOBS.map((job) => {
    const runs = checkRuns.filter((c) => c.name === job && isActionsCheck(c));
    const ev = evidenceOf(runs);
    const isRequired = required.has(job);
    const unfinished = runs.some((r) => r.status !== "completed");
    const fallback = isRequired ? "never ran" : defined.has(job) ? "skipped" : NOT_IN_WORKFLOW;
    const result = ev?.conclusion ?? (unfinished ? "running" : fallback);
    return {
      job,
      required: isRequired,
      result,
      run: ev?.run ?? null,
      at: ev?.at ?? null,
      problem: problemOf(job, result, isRequired),
    };
  });
}

/**
 * The state of one PR from one snapshot: `merged`, `closed`, `conflict` and `computing` (GitHub has not decided
 * mergeability yet) come first; `running` while any check run or workflow run of the head is unfinished; otherwise
 * `settled` with the problems (empty when every required job succeeded and no code-scanning check failed).
 */
export function assess(snap) {
  const { pr, head, checkRuns, workflowRuns, files } = snap;
  const defined = snap.defined ?? new Set(JOBS);
  const required = requiredJobs({ files, base: pr.base, draft: pr.draft, defined });
  const rows = [...rowsOf(checkRuns, required, defined), ...scanRowsOf(checkRuns)];
  const aggregate = evidenceOf(
    checkRuns.filter((c) => c.name === "ci-status" && isActionsCheck(c)),
  );
  const base = { pr, head, rows, aggregate };
  if (pr.merged) return { ...base, status: "merged" };
  if (pr.state !== "open") return { ...base, status: "closed" };
  // A draft has no CI run to wait for, so its jobs are not judged (issue 1608).
  if (pr.draft) return { ...base, rows: [], status: "draft" };
  if (pr.mergeable === false || pr.mergeableState === "dirty")
    return { ...base, status: "conflict" };
  if (pr.mergeable === null) return { ...base, status: "computing" };
  const unfinished = [
    ...checkRuns.filter((c) => c.status !== "completed").map((c) => c.name),
    ...workflowRuns
      .filter((w) => w.status !== "completed")
      .map((w) => `${w.name} workflow run (${w.status})`),
  ];
  if (unfinished.length) return { ...base, status: "running", unfinished };
  const ciRan = checkRuns.some((c) => isActionsCheck(c) && CI_NAMES.has(c.name));
  const problems = ciRan
    ? rows.map((r) => r.problem).filter(Boolean)
    : ["no CI run on the head commit"];
  return { ...base, status: "settled", problems };
}

/** The fields the reading uses, from one `GET repos/<repo>/pulls/<n>` answer. */
export function pullOf(p) {
  return {
    number: p.number,
    title: p.title,
    url: p.html_url,
    state: p.state,
    merged: p.merged === true || Boolean(p.merged_at),
    mergedAt: p.merged_at ?? null,
    draft: Boolean(p.draft),
    base: p.base?.ref ?? "",
    head: p.head?.sha ?? "",
    // The commit whose workflow a `pull_request` run uses (issue 1608); null while GitHub has not computed it.
    mergeCommit: p.merge_commit_sha ?? null,
    mergeable: p.mergeable ?? null,
    mergeableState: p.mergeable_state ?? "",
  };
}

/** Exit code of a final assessment: 0 when merged (not waited for) or settled without problems, 1 otherwise. */
export function exitCodeOf(a) {
  if (a.status === "merged") return 0;
  return a.status === "settled" && a.problems.length === 0 ? 0 : 1;
}

/** The problems that stop a merge right now, for `make merge`: nothing is waited for, a running CI refuses. */
export function problemsNow(a) {
  switch (a.status) {
    case "settled":
      return a.problems.map((p) => `CI: ${p}`);
    case "running":
      return [
        `CI is still running (${a.unfinished.join(", ")}); wait for it with make ci-wait PR=${a.pr.number}`,
      ];
    case "conflict":
      return ["the PR conflicts with dev, so it gets no CI run"];
    case "draft":
      return [
        "the PR is a draft and has no CI run: make pr marks it ready for review and starts the run",
      ];
    case "computing":
      return ["GitHub has not computed whether the PR merges yet; try again"];
    default:
      return [`the PR is ${a.status}`];
  }
}
