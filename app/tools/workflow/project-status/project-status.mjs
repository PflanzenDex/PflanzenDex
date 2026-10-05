// Moves the project status on PR events (US-DEV-05); run by .github/workflows/project-status.yml with a GitHub App
// token in GH_TOKEN. Usage: node project-status.mjs event <event.json>   |   node project-status.mjs check
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { json, realClient } from "../claim/lib/claim-client.mjs";
import { PROJECT_NUMBER, STATUS_FIELD } from "../claim/lib/claim-steps.mjs";
import { drift, transitions } from "./project-status-lib.mjs";

const OWNER = "PflanzenDex";

export async function loadItems(client) {
  const list = await json(client, [
    "project",
    "item-list",
    PROJECT_NUMBER,
    "--owner",
    OWNER,
    "--limit",
    "1000",
    "--format",
    "json",
  ]);
  return list.items
    .filter((i) => i.content?.type === "Issue")
    .map((i) => ({
      id: i.id,
      issue: i.content.number,
      status: i.status,
      priority: i.priority,
      epic: i.typ === "Epic",
    }));
}

export async function setStatuses(client, items, changes) {
  if (!changes.length) return;
  const fields = await json(client, [
    "project",
    "field-list",
    PROJECT_NUMBER,
    "--owner",
    OWNER,
    "--format",
    "json",
  ]);
  const field = fields.fields.find((f) => f.name === STATUS_FIELD);
  const project = await json(client, [
    "project",
    "view",
    PROJECT_NUMBER,
    "--owner",
    OWNER,
    "--format",
    "json",
  ]);
  for (const { issue, status } of changes) {
    const option = field.options.find((o) => o.name === status);
    if (!option) throw new Error(`project field "${STATUS_FIELD}" has no option "${status}"`);
    const item = items.find((i) => i.issue === issue);
    await client.run("gh", [
      "project",
      "item-edit",
      "--id",
      item.id,
      "--project-id",
      project.id,
      "--field-id",
      field.id,
      "--single-select-option-id",
      option.id,
    ]);
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
    const found = drift(items, prs);
    for (const f of found) console.log(`#${f.issue}: ${f.problem}`);
    console.log(`${found.length} drift finding(s).`);
    return found.length ? 1 : 0;
  }
  console.error("usage: project-status.mjs event <event.json> | check");
  return 2;
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  process.exit(await main(process.argv.slice(2)));
