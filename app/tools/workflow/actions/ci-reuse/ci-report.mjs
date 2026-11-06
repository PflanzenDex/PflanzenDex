// The text of a final CI assessment (US-DEV-10, `make ci-wait PR=<n>`): one line per judged job with its real result and the
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
  const ci = `  ${"ci-status".padEnd(width)} aggregate, not judged: ${a.aggregate?.conclusion ?? "none"}`;
  return [title, ...a.rows.map((r) => rowLine(r, width)), ci, verdictOf(a)].join("\n");
}
