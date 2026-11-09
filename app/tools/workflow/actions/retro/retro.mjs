// `make retro` (US-DEV-11): the issue flow retro. Prints the report; with --write it rewrites the body of the pinned
// report issue (creates, locks and pins it when missing). Run by .github/workflows/retro.yml with GH_TOKEN.
// The process share (E-30) comes with every run. The implementer rework is computed only by the scheduled and manual runs
// (RETRO_EVENT is `schedule` or `workflow_dispatch`, or the flag --rework); other runs keep it from the report body.
// Usage: node retro.mjs [--write] [--rework]
import { fileURLToPath } from "node:url";
import { json, realClient } from "../../claim/lib/claim-client.mjs";
import {
  dayOf,
  inFullDays,
  kindOf,
  LONG_DAYS,
  REPORT_LABEL,
  REPORT_TITLE,
  reworkByKind,
  reworkOf,
  reworkRequested,
  windowStart,
} from "./retro-lib.mjs";
import { renderReport } from "./retro-render.mjs";
import { keptRework, reworkSection, TRAILER_SINCE } from "./retro-sections.mjs";

const PAGE = 100;
// Parallel commit and file reads of the rework (starting value, assumption): a nightly run of about 500 reads stays well
// inside the five-minute job limit and under the REST secondary limits.
const REWORK_CONCURRENCY = 6;

/** Every issue and pull request of the repository, one JSON object per line (the REST list returns both). */
export async function fetchIssues(client) {
  const out = await client.run("gh", [
    "api",
    "--paginate",
    "repos/{owner}/{repo}/issues?state=all&per_page=100",
    "--jq",
    ".[] | {number, created_at, closed_at, labels: [.labels[].name], pull_request: (.pull_request != null)}",
  ]);
  return out
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

/**
 * Merged pull requests into dev, from one REST list read page by page, most recently updated first. Reading stops at the
 * first page whose last pull request was updated before the long window: a merged pull request is never updated before
 * its merge, so nothing older can be inside the window.
 */
export async function fetchMergedPulls(client, today) {
  const since = windowStart(today, LONG_DAYS);
  const merged = [];
  for (let page = 1; ; page += 1) {
    const batch = await json(client, [
      "api",
      `repos/{owner}/{repo}/pulls?state=closed&base=dev&sort=updated&direction=desc&per_page=${PAGE}&page=${page}`,
    ]);
    merged.push(...batch.filter((p) => p.merged_at));
    if (batch.length < PAGE || dayOf(batch.at(-1).updated_at) < since) return merged;
  }
}

/** `fn` over `items` with at most `limit` calls in flight; the results keep the order of `items`. */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next;
      next += 1;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/**
 * Implementer rework of the merged pull requests of the long window (US-DEV-11): one commit list per pull request, and the
 * changed files only for those with an implementer commit. Lists are read up to 100 items (commits and files).
 */
// A PR merged before the trailer existed has no attributed commit, so its commits are not read (one call per PR saved).
export async function fetchRework(client, pulls, today) {
  const recent = pulls.filter(
    (p) => inFullDays(dayOf(p.merged_at), today, LONG_DAYS) && dayOf(p.merged_at) >= TRAILER_SINCE,
  );
  const counted = await mapLimit(recent, REWORK_CONCURRENCY, async (p) => {
    const commits = await json(client, [
      "api",
      `repos/{owner}/{repo}/pulls/${p.number}/commits?per_page=${PAGE}`,
    ]);
    const rework = reworkOf(
      commits.map((c) => ({ message: c.commit.message, parents: c.parents.length })),
    );
    if (!rework) return null;
    const files = await json(client, [
      "api",
      `repos/{owner}/{repo}/pulls/${p.number}/files?per_page=${PAGE}`,
    ]);
    return { kind: kindOf(files.map((f) => f.filename)), rework: rework.rework };
  });
  return reworkByKind(counted.filter(Boolean));
}

async function findReport(client) {
  const open = await json(client, [
    "issue",
    "list",
    "--label",
    REPORT_LABEL,
    "--state",
    "open",
    "--json",
    "number,title,body",
  ]);
  return open.find((i) => i.title === REPORT_TITLE) ?? null;
}

/** New report issue: label, no milestone, no project; locked so nobody discusses or works in it. */
async function createReport(client, body, out) {
  await client.run("gh", [
    "label",
    "create",
    REPORT_LABEL,
    "--description",
    "Generated report, not a work item (US-DEV-11)",
    "--color",
    "ededed",
    "--force",
  ]);
  const url = await client.run("gh", [
    "issue",
    "create",
    "--title",
    REPORT_TITLE,
    "--label",
    REPORT_LABEL,
    "--body",
    body,
  ]);
  const number = url.trim().split("/").at(-1);
  await client.run("gh", ["issue", "lock", number]);
  try {
    await client.run("gh", ["issue", "pin", number]);
  } catch (e) {
    out.warn(`WARNING: report issue #${number} not pinned (${e.message}); pin it by hand`);
  }
  out.log(`Created report issue #${number}`);
}

export async function main(
  argv,
  client = realClient(),
  out = console,
  { today = dayOf(Date.now()), env = process.env } = {},
) {
  const issues = await fetchIssues(client);
  const pulls = await fetchMergedPulls(client, today);
  const report = await findReport(client);
  const rework = reworkRequested(argv, env)
    ? reworkSection(await fetchRework(client, pulls, today))
    : keptRework(report?.body);
  const body = renderReport(issues, today, { pulls, rework });
  if (!argv.includes("--write")) {
    out.log(body);
    return 0;
  }
  if (!report) await createReport(client, body, out);
  else if (report.body.trim() === body.trim()) out.log(`Report issue #${report.number} unchanged`);
  else {
    await client.run("gh", ["issue", "edit", String(report.number), "--body", body]);
    out.log(`Updated report issue #${report.number}`);
  }
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  process.exit(await main(process.argv.slice(2)));
