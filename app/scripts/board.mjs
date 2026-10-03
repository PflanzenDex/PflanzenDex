// `make board` (US-DEV-08): who works on which open story/enabler of the milestone, with PR and age of the
// last commit. Flags: STALE (claim older than CLAIM_STALE_HOURS, default 48, assumption), DOUBLE (more than
// one assignee, live branch or open PR for one story) and NO-CLAIM (work exists but nobody is assigned).
// Usage: node board.mjs [milestone]   (default: the open milestone with the lowest number)
import { fileURLToPath } from "node:url";
import { fetchPrs, fetchWorkItems, openMilestone, realClient } from "./claim-client.mjs";
import { ageHours, claimKey, hasKey, prReferences, prState, staleHoursFrom } from "./claim-lib.mjs";

const latest = (dates) => dates.filter(Boolean).sort().at(-1) ?? null;

export function buildRows({ items, prs, branchDates, now, staleHours }) {
  return items.map((issue) => {
    const key = claimKey(issue);
    const related = prs.filter((p) => prReferences(p, issue));
    const open = related.filter((p) => prState(p) === "open");
    const finished = new Set(
      related.filter((p) => prState(p) !== "open").map((p) => p.headRefName),
    );
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

export function formatRows(rows, staleHours) {
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
    const milestone = process.argv[2] || (await openMilestone(client));
    const staleHours = staleHoursFrom(process.env);
    const [items, prs, branchDates] = await Promise.all([
      fetchWorkItems(client, milestone),
      fetchPrs(client),
      branchDatesOf(client),
    ]);
    console.log(`Milestone: ${milestone}`);
    console.log(
      formatRows(buildRows({ items, prs, branchDates, now: Date.now(), staleHours }), staleHours),
    );
  } catch (e) {
    console.error(`board failed: ${e.message}`);
    process.exit(1);
  }
}
