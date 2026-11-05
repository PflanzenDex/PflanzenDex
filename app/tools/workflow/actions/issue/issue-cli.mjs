// Command line of the issue tools (FR-DEV-10); the make targets make issue, make issue-check and make issue-sync call it:
//   node issue-cli.mjs create --type <label> --epic <code> --priority <P0-P3> --title <text> --body-file <file>
//   node issue-cli.mjs check --issue <n> [--event <action>]     (writes valid, type, epic to $GITHUB_OUTPUT when set)
//   node issue-cli.mjs sync --issue <n> --type <label> --epic <code>
// Exit 0 ok, 1 refused or failed, 2 usage. Operations: issue.mjs. Allowed list: app/config/project/issue-taxonomy.json.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { realClient } from "../../claim/lib/claim-client.mjs";
import { checkIssue, createIssue, IssueRefused, syncIssue } from "./issue.mjs";

const TAXONOMY_FILE = fileURLToPath(
  new URL("../../../../config/project/issue-taxonomy.json", import.meta.url),
);

export const loadTaxonomy = (file = TAXONOMY_FILE) => JSON.parse(readFileSync(file, "utf8"));

class UsageError extends Error {}

const OPTIONS = {
  create: {
    type: { type: "string" },
    epic: { type: "string" },
    priority: { type: "string" },
    title: { type: "string" },
    "body-file": { type: "string" },
  },
  check: { issue: { type: "string" }, event: { type: "string", default: "" } },
  sync: { issue: { type: "string" }, type: { type: "string" }, epic: { type: "string" } },
};

function issueNumber(value) {
  if (!/^\d+$/.test(value ?? "")) throw new UsageError("missing or invalid --issue <number>");
  return Number(value);
}

/** Runs one mode and returns the exit code; refusals and failures are thrown for the caller to print. */
export async function main(
  argv,
  { client = realClient(), taxonomy = loadTaxonomy(), env = {}, log = console.log } = {},
) {
  const [mode, ...rest] = argv;
  if (!OPTIONS[mode]) throw new UsageError("usage: issue-cli.mjs create|check|sync [options]");
  let values;
  try {
    ({ values } = parseArgs({ args: rest, options: OPTIONS[mode], strict: true }));
  } catch (e) {
    throw new UsageError(e.message);
  }
  if (mode === "create") {
    let body;
    try {
      body = readFileSync(values["body-file"] ?? "", "utf8");
    } catch (e) {
      throw new IssueRefused([`cannot read the body file: ${e.message}`]);
    }
    const input = {
      type: values.type,
      epic: values.epic,
      priority: values.priority,
      title: values.title,
      body,
    };
    await createIssue(client, input, { taxonomy, env, log });
  } else if (mode === "check") {
    await checkIssue(client, issueNumber(values.issue), {
      event: values.event,
      taxonomy,
      output: env.GITHUB_OUTPUT,
      log,
    });
  } else {
    await syncIssue(client, issueNumber(values.issue), {
      type: values.type,
      epic: values.epic,
      taxonomy,
      env,
      log,
    });
  }
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2), { env: process.env })
    .then((code) => process.exit(code))
    .catch((e) => {
      if (e instanceof UsageError) {
        console.error(e.message);
        process.exit(2);
      }
      if (e instanceof IssueRefused) {
        console.error(`issue: refused, nothing was changed on GitHub for this step:\n${e.message}`);
      } else {
        console.error(`issue: failed: ${e.message}`);
      }
      process.exit(1);
    });
}
