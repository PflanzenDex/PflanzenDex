// Moves the project status on PR events (US-DEV-05); run by .github/workflows/project-status.yml with a GitHub App
// token in GH_TOKEN. Usage: node project-status.mjs event <event.json>   |   node project-status.mjs check
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { json, realClient } from "../../claim/lib/claim-client.mjs";
import {
  editBoardField,
  listBoardItems,
  projectMeta,
  STATUS_FIELD,
} from "../../claim/lib/board-client.mjs";
import { drift, transitions } from "./project-status-lib.mjs";

const OWNER = "PflanzenDex";

/** Every issue on the board, as { id, issue, status, priority, epic, typ, release } (pages of 100, see board-client.mjs). */
export const loadItems = (client) => listBoardItems(client, OWNER);

/** The options of the project field Release in their board order (R0 first); the board, not a milestone, holds it. */
export async function releaseOrder(client) {
  const meta = await projectMeta(client, OWNER);
  return (meta.fields.find((f) => f.name === "Release")?.options ?? []).map((o) => o.name);
}

/** Issue numbers among `numbers` that are open project items without a priority (epics need none). `items` saves a second listing. */
export async function missingPriority(client, numbers, items) {
  const list = items ?? (await loadItems(client));
  return numbers.filter((n) => {
    const item = list.find((i) => i.issue === n);
    return item && !item.priority && !item.epic;
  });
}

export async function setStatuses(client, items, changes) {
  if (!changes.length) return;
  const meta = await projectMeta(client, OWNER);
  const field = meta.fields.find((f) => f.name === STATUS_FIELD);
  for (const { issue, status } of changes) {
    const option = field.options.find((o) => o.name === status);
    if (!option) throw new Error(`project field "${STATUS_FIELD}" has no option "${status}"`);
    const item = items.find((i) => i.issue === issue);
    await editBoardField(client, { meta, itemId: item.id, field, option });
    console.log(`#${issue}: ${item.status} -> ${status}`);
  }
}

export async function main(argv, client = realClient()) {
  const [mode, file] = argv;
  const items = await loadItems(client);
  if (mode === "event") {
    const { pull_request: p } = JSON.parse(readFileSync(file, "utf8"));
    const pr = { number: p.number, body: p.body, base: p.base.ref, merged: p.merged };
    const open = await json(client, [
      "pr",
      "list",
      "--state",
      "open",
      "--limit",
      "300",
      "--json",
      "number,body",
    ]);
    await setStatuses(client, items, transitions(pr, items, open));
    return 0;
  }
  if (mode === "check") {
    const all = await json(client, [
      "pr",
      "list",
      "--state",
      "all",
      "--limit",
      "500",
      "--json",
      "number,body,state,baseRefName",
    ]);
    const prs = all.map((p) => ({ ...p, base: p.baseRefName, state: p.state.toLowerCase() }));
    const openIssues = await json(client, [
      "issue",
      "list",
      "--state",
      "open",
      "--limit",
      "1000",
      "--json",
      "number",
    ]);
    const open = new Set(openIssues.map((i) => i.number));
    const found = drift(
      items.map((i) => ({ ...i, open: open.has(i.issue) })),
      prs,
    );
    for (const f of found) console.log(`#${f.issue}: ${f.problem}`);
    console.log(`${found.length} drift finding(s).`);
    return found.length ? 1 : 0;
  }
  console.error("usage: project-status.mjs event <event.json> | check");
  return 2;
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  process.exit(await main(process.argv.slice(2)));
