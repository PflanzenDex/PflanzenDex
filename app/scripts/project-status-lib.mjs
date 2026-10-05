// Pure rules of the project status machine (workflow project-status.yml). The status follows the pull requests:
//   PR into dev merged                      -> On dev   (issues named by "Closes #n")
//   PR into dev closed without a merge      -> Todo     (unless another open PR still names the issue)
//   release PR dev -> main merged           -> Done     (every item that is On dev)
// No I/O here; project-status.mjs reads the event and writes the project.
export const STATUS = { todo: "Todo", inProgress: "In Progress", onDev: "On dev", done: "Done" };

/** What to do about a ticket without a priority; the rule itself is in CLAUDE.md ("Priority of tickets"). */
export const PRIORITY_HINT =
  "no priority: set the project field Priority (P0 critical, P1 high, P2 normal, P3 low; rule in CLAUDE.md)";

const CLOSING = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+#(\d+)\b/gi;

/** Issue numbers a PR closes, from its body. Only closing keywords count: a story key in a title is too loose. */
export function closedIssues(pr) {
  return [...new Set([...(pr.body ?? "").matchAll(CLOSING)].map((m) => Number(m[1])))];
}

/**
 * Status changes for a closed pull request.
 * `items`: project items as { issue, status }; `openPrs`: other open PRs as { number, body }.
 * Returns [{ issue, status }] only for items whose status actually changes.
 */
export function transitions(pr, items, openPrs = []) {
  const byIssue = new Map(items.map((i) => [i.issue, i]));
  const set = (issue, status) => {
    const item = byIssue.get(issue);
    return item && item.status !== status ? [{ issue, status }] : [];
  };
  if (pr.merged && pr.base === "main") {
    return items
      .filter((i) => i.status === STATUS.onDev)
      .map((i) => ({ issue: i.issue, status: STATUS.done }));
  }
  if (pr.base !== "dev") return [];
  const named = closedIssues(pr);
  if (pr.merged) return named.flatMap((n) => set(n, STATUS.onDev));
  const stillOpen = new Set(openPrs.filter((p) => p.number !== pr.number).flatMap(closedIssues));
  return named
    .filter((n) => !stillOpen.has(n))
    .flatMap((n) => (byIssue.get(n)?.status === STATUS.inProgress ? set(n, STATUS.todo) : []));
}

/**
 * Drift report: items whose status contradicts the pull requests, or that have no priority.
 * `prs`: all PRs as { number, base, state: "open"|"merged"|"closed", body }.
 */
export function drift(items, prs) {
  const out = [];
  for (const item of items) {
    const refs = prs.filter((p) => closedIssues(p).includes(item.issue));
    const open = refs.some((p) => p.state === "open");
    const merged = refs.some((p) => p.state === "merged" && p.base === "dev");
    if (item.status === STATUS.inProgress && !open)
      out.push({ issue: item.issue, problem: "In Progress without an open PR" });
    if (item.status === STATUS.todo && open)
      out.push({ issue: item.issue, problem: "Todo but an open PR names it" });
    if (item.status === STATUS.todo && !open && merged)
      out.push({ issue: item.issue, problem: "Todo but a PR into dev is merged" });
    if (
      (item.status === STATUS.todo || item.status === STATUS.inProgress) &&
      !item.priority &&
      !item.epic
    )
      out.push({ issue: item.issue, problem: "no priority" });
  }
  return out;
}
