// The text of a final CI assessment (US-DEV-13, `make ci-wait PR=<n>`): one line per judged job with its real result and the
// run that gave it, the aggregate `ci-status` for comparison, and the verdict. Pure, see ci-verdict.mjs.
import { NOT_IN_WORKFLOW, shortSha } from "./ci-verdict.mjs";

const NAME_WIDTH = 18;
const RESULT_WIDTH = 15;

function rowLine(r, width) {
  const detail = r.at
    ? `run ${r.run}, completed ${r.at}`
    : r.result === "skipped"
      ? r.scanning
        ? "no analysis ran on this head"
        : "not required for this PR"
      : r.result === "running"
        ? "still running"
        : r.result === NOT_IN_WORKFLOW
          ? "the workflow of this head commit does not define it"
          : "no run finished it";
  const need = r.scanning ? "scanning" : r.required ? "required" : "optional";
  return `  ${r.job.padEnd(width)} ${r.result.padEnd(RESULT_WIDTH)} ${need.padEnd(8)} ${detail}`;
}

function verdictOf(a) {
  const n = a.pr.number;
  switch (a.status) {
    case "merged":
      return `ci-wait: PR #${n} is already merged${a.pr.mergedAt ? ` (at ${a.pr.mergedAt})` : ""}; nothing to wait for. The result above is for information.`;
    case "closed":
      return `ci-wait: PR #${n} was closed without a merge.`;
    case "conflict":
      return `ci-wait: PR #${n} conflicts with dev. A conflicting PR gets no CI run, so nothing would finish: resolve the conflict and push.`;
    case "draft":
      return `ci-wait: PR #${n} is a draft, and a draft has no CI run. make pr marks it ready for review and starts the CI run; then wait again.`;
    case "timeout": {
      const minutes = Math.round((a.afterMs ?? 0) / 60_000);
      const open = a.unfinished?.join(", ") ?? "GitHub has not computed mergeability yet";
      return `ci-wait: timed out after ${minutes} min; still open: ${open}. Look at the checks of PR #${n} on GitHub.`;
    }
    default:
      return a.problems.length
        ? `ci-wait: not green: ${a.problems.join("; ")}`
        : `ci-wait: green, every required job succeeded on ${shortSha(a.head)}.`;
  }
}

/** The report of one assessment as printed by `make ci-wait`. */
export function report(a) {
  const { pr } = a;
  const width = Math.max(NAME_WIDTH, ...a.rows.map((r) => r.job.length));
  const title = `ci-wait: PR #${pr.number} "${pr.title}" on ${shortSha(a.head)} (base ${pr.base}${pr.draft ? ", draft" : ""})`;
  // A draft is not judged job by job: it has no CI run (issue 1608).
  if (a.status === "draft") return [title, verdictOf(a)].join("\n");
  const ci = `  ${"ci-status".padEnd(width)} aggregate, not judged: ${a.aggregate?.conclusion ?? "none"}`;
  return [title, ...a.rows.map((r) => rowLine(r, width)), ci, verdictOf(a)].join("\n");
}

const shortList = (names) =>
  names.length > 4
    ? `${names.slice(0, 4).join(", ")} and ${names.length - 4} more`
    : names.join(", ");

/**
 * The CI state of a PR as it stands, in one line, for `make gate-review` (US-QG-07). Unlike `report`, it never waits: a
 * running job is named as running, and the aggregate `ci-status` is shown as not judged (it can read green meanwhile).
 */
export function stateLine(a) {
  const aggregate = `ci-status: ${a.aggregate?.conclusion ?? "none"}, not judged`;
  switch (a.status) {
    case "conflict":
      return "not run: the PR conflicts with dev, so it gets no CI run";
    case "computing":
      return "not known yet: GitHub has not computed whether the PR merges";
    case "draft":
      return "not run: the PR is a draft, make pr marks it ready and starts its CI";
    case "running":
      return `running, not waited for: ${shortList(a.unfinished)} (${aggregate})`;
    case "settled":
      return a.problems.length
        ? `not green: ${a.problems.join("; ")} (${aggregate})`
        : `green, every required job succeeded on ${shortSha(a.head)} (${aggregate})`;
    default:
      return `the PR is ${a.status}`;
  }
}
