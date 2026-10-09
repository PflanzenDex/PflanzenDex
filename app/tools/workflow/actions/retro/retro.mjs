// `make retro` (US-DEV-11): the issue flow retro. Prints the report; with --write it rewrites the body of the pinned
// report issue (creates, locks and pins it when missing). Run by .github/workflows/retro.yml with GH_TOKEN.
// Usage: node retro.mjs [--write]
import { fileURLToPath } from "node:url";
import { json, realClient } from "../../claim/lib/claim-client.mjs";
import { dayOf, REPORT_LABEL, REPORT_TITLE } from "./retro-lib.mjs";
import { renderReport } from "./retro-render.mjs";

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

export async function main(argv, client = realClient(), out = console, today = dayOf(Date.now())) {
  const body = renderReport(await fetchIssues(client), today);
  if (!argv.includes("--write")) {
    out.log(body);
    return 0;
  }
  const report = await findReport(client);
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
