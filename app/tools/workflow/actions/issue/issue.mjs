// Issue labels and board fields (FR-DEV-10, US-DEV-05): the operations behind `make issue`, `make issue-check` and
// `make issue-sync`. The command line is issue-cli.mjs, the rules issue-lib.mjs, the project writes issue-board.mjs.
// Every operation refuses before it writes anything.
import { appendFileSync } from "node:fs";
import { json } from "../../claim/lib/claim-client.mjs";
import { STATUS } from "../project-status/project-status-lib.mjs";
import { boardStatusOf, setBoardFields } from "./issue-board.mjs";
import {
  boardFieldsFor,
  commentBody,
  issueNumberOf,
  issueUrl,
  REPORT_LABEL,
  shouldComment,
  TRIAGE_LABEL,
  validateLabels,
  validateNewIssue,
} from "./issue-lib.mjs";

/** A refusal with its reasons; nothing was written when it is thrown. */
export class IssueRefused extends Error {
  constructor(problems) {
    super(problems.map((p) => `  - ${p}`).join("\n"));
    this.problems = problems;
  }
}

/** Owner/name of the repository: GH_REPO in CI, otherwise the repository of the checkout. */
async function repoOf(client, env) {
  if (env.GH_REPO) return env.GH_REPO;
  return (
    await client.run("gh", ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"])
  ).trim();
}

/** Creates the issue after the checks; the board fields follow. A failed board write keeps the issue and says how to repair it. */
export async function createIssue(client, input, { taxonomy, env = {}, log = console.log }) {
  const plan = validateNewIssue(input, taxonomy);
  if (!plan.ok) throw new IssueRefused(plan.errors);
  const repo = await repoOf(client, env);
  const out = await client.run("gh", [
    "issue",
    "create",
    `--title=${plan.title}`,
    `--body=${plan.body}`,
    ...plan.labels.map((label) => `--label=${label}`),
  ]);
  const url = out.trim();
  const number = issueNumberOf(url);
  log(`Created #${number}: ${url}`);
  try {
    await setBoardFields(client, { url, owner: repo.split("/")[0], fields: plan.fields });
    log(
      `Board: Status ${plan.fields.Status}, Typ ${plan.fields.Typ}, Epic ${plan.fields.Epic}, Priority ${plan.fields.Priority}`,
    );
  } catch (e) {
    throw new Error(
      `#${number} was created with its labels, but its board fields are not set (${e.message}). Run: make issue-sync ISSUE=${number} TYPE=${plan.type} EPIC=${plan.epic}, then set Priority by hand.`,
      { cause: e },
    );
  }
  return { number, url };
}

/** Labels of one issue decide: comment and needs-triage when invalid, needs-triage removed when valid. */
export async function checkIssue(
  client,
  number,
  { event = "", taxonomy, output, log = console.log },
) {
  const issue = await json(client, ["issue", "view", String(number), "--json", "number,labels"]);
  const names = issue.labels.map((l) => l.name);
  if (names.includes(REPORT_LABEL)) {
    log(`#${number} is a report issue (label ${REPORT_LABEL}): not checked`);
    return { valid: false, skipped: true };
  }
  const verdict = validateLabels(names, taxonomy);
  const flagged = names.includes(TRIAGE_LABEL);
  if (shouldComment({ verdict, flagged, event }))
    await client.run("gh", [
      "issue",
      "comment",
      String(number),
      `--body=${commentBody(verdict, taxonomy)}`,
    ]);
  if (!verdict.ok && !flagged)
    await client.run("gh", ["issue", "edit", String(number), `--add-label=${TRIAGE_LABEL}`]);
  if (verdict.ok && flagged)
    await client.run("gh", ["issue", "edit", String(number), `--remove-label=${TRIAGE_LABEL}`]);
  const result = { valid: verdict.ok, type: verdict.typeLabel, epic: verdict.epicCode };
  if (output)
    appendFileSync(
      output,
      `valid=${result.valid}\n${result.valid ? `type=${result.type}\nepic=${result.epic}\n` : ""}`,
    );
  const problems = [
    ...verdict.missing.map((m) => `missing ${m}`),
    ...verdict.unknown,
    ...verdict.multiple,
  ];
  log(
    verdict.ok
      ? `#${number} is valid: type ${result.type}, epic ${result.epic}`
      : `#${number} is invalid: ${problems.join(", ")}`,
  );
  return result;
}

/**
 * Board fields of an issue from its type label and epic code: Typ and Epic always, Status Todo only when the item has
 * no Status yet. The workflow runs this on edits too, so an existing Status (In Progress, On dev, Done) is never
 * overwritten (FR-DEV-10 (e)).
 */
export async function syncIssue(
  client,
  number,
  { type, epic, taxonomy, env = {}, log = console.log },
) {
  const fields = boardFieldsFor(taxonomy, type, epic);
  if (!fields) throw new IssueRefused([`unknown type "${type ?? ""}" or epic "${epic ?? ""}"`]);
  const repo = await repoOf(client, env);
  const status = await boardStatusOf(client, { repo, number });
  const wanted = status ? fields : { ...fields, Status: STATUS.todo };
  await setBoardFields(client, {
    url: issueUrl(repo, number),
    owner: repo.split("/")[0],
    fields: wanted,
  });
  log(
    `#${number} board: Typ ${fields.Typ}, Epic ${fields.Epic}, ${status ? `Status ${status} (kept)` : "Status Todo (set)"}`,
  );
  return wanted;
}
