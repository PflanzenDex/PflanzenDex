// `make board` (US-DEV-08): who works on which open story/enabler of a release, with PR and age of the
// last commit. Flags: STALE (claim older than CLAIM_STALE_HOURS, default 48, assumption), DOUBLE (more than
// one assignee, live branch or open PR for one story) and NO-CLAIM (work exists but nobody is assigned).
// Release and type come from the project board (fields Release and Typ), not from milestones or labels.
// Usage: node board.mjs [release]   (default: the first release in board order with open work)
import { fileURLToPath } from "node:url";
import { fetchOpenIssues, fetchPrs, realClient } from "./claim/lib/claim-client.mjs";
import { PRIORITY_HINT } from "./actions/project-status/project-status-lib.mjs";
import {
  loadItems,
  missingPriority,
  releaseOrder,
} from "./actions/project-status/project-status.mjs";
import {
  ageHours,
  claimKey,
  firstOpenRelease,
  hasKey,
  prReferences,
  prState,
  staleHoursFrom,
  workItems,
} from "./claim/lib/claim-lib.mjs";

const latest = (dates) => dates.filter(Boolean).sort().at(-1) ?? null;

export function buildRows({ items, prs, branchDates, now, staleHours, noPriority = [] }) {
  return items.map((issue) => {
    const key = claimKey(issue);
    const related = prs.filter((p) => prReferences(p, issue));
    const open = related.filter((p) => prState(p) === "open");
    // Every finished PR retires its branch, also one that never named the issue (merged without "Closes #n").
    const finished = new Set(prs.filter((p) => prState(p) !== "open").map((p) => p.headRefName));
    const openHeads = new Set(open.map((p) => p.headRefName));
    const branches = Object.keys(branchDates).filter(
      (b) => openHeads.has(b) || (hasKey(b, key) && !finished.has(b)),
    );
    const last = latest(branches.map((b) => branchDates[b]));
    const assignees = issue.assignees.map((a) => a.login);
    const age = last ? ageHours(last, now) : null;
    const claimAge = ageHours(last ?? issue.updatedAt, now);
    const flags = [];
    if (assignees.length && claimAge > staleHours) flags.push("STALE");
    if (assignees.length > 1 || branches.length > 1 || open.length > 1) flags.push("DOUBLE");
    if (!assignees.length && (branches.length || open.length)) flags.push("NO-CLAIM");
    if (noPriority.includes(issue.number)) flags.push("NO-PRIO");
    return {
      number: issue.number,
      key,
      title: issue.title,
      assignees,
      prs: open.map((p) => `#${p.number}${p.isDraft ? " draft" : ""}`),
      branches,
      age,
      flags,
    };
  });
}

export function formatRows(rows, staleHours, noPriority = []) {
  const line = (r) =>
    [
      `#${r.number}`.padEnd(5),
      r.key.toUpperCase().padEnd(10),
      (r.assignees.map((a) => `@${a}`).join(",") || "-").padEnd(16),
      (r.prs.join(",") || "-").padEnd(12),
      (r.age === null ? "-" : `${r.age}h`).padEnd(6),
      r.flags.join(" "),
    ].join(" ");
  const head = `Issue ID         Assignee         PR           Age    Flags (stale after ${staleHours}h, assumption)`;
  const claimed = rows.filter((r) => r.assignees.length || r.branches.length || r.prs.length);
  const free = rows.length - claimed.length;
  return [
    head,
    ...claimed.map(line),
    `${free} further open items are free to claim (make claim ISSUE=<n>).`,
    ...(noPriority.length
      ? [
          `${noPriority.length} open item(s) without a priority: ${PRIORITY_HINT}. #${noPriority.join(", #")}`,
        ]
      : []),
  ].join("\n");
}

async function branchDatesOf(client) {
  const out = await client.run("git", [
    "for-each-ref",
    "--format=%(refname:strip=3)\t%(committerdate:iso-strict)",
    "refs/remotes/origin",
  ]);
  return Object.fromEntries(
    out
      .split("\n")
      .map((l) => l.split("\t"))
      .filter(([name, date]) => name && date && !["HEAD", "main", "dev"].includes(name)),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const client = realClient();
  try {
    await client.run("git", ["fetch", "--quiet", "--prune", "origin"]);
    const staleHours = staleHoursFrom(process.env);
    const [issues, board, order, prs, branchDates] = await Promise.all([
      fetchOpenIssues(client),
      loadItems(client),
      releaseOrder(client),
      fetchPrs(client),
      branchDatesOf(client),
    ]);
    const release = process.argv[2] || firstOpenRelease(order, issues, board);
    if (!release) throw new Error("no release on the board has open stories or enablers");
    const items = workItems(issues, board, release);
    console.log(`Release: ${release}`);
    const noPriority = await missingPriority(
      client,
      items.map((i) => i.number),
    ).catch((e) => {
      console.error(`Warning: could not check priorities: ${e.message}`);
      return [];
    });
    const rows = buildRows({ items, prs, branchDates, now: Date.now(), staleHours, noPriority });
    console.log(formatRows(rows, staleHours, noPriority));
  } catch (e) {
    console.error(`board failed: ${e.message}`);
    process.exit(1);
  }
}
