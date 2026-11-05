// Issue labels and board fields (FR-DEV-10, US-DEV-05): the operations behind `make issue`, `make issue-check` and
// `make issue-sync`. The command line is issue-cli.mjs, the rules issue-lib.mjs, the project writes issue-board.mjs.
// Every operation refuses before it writes anything. Creating the issue is REST, so it works when the GraphQL budget is used up.
import { appendFileSync } from "node:fs";
import { createIssueRest, json, repoName } from "../../claim/lib/claim-client.mjs";
import { STATUS } from "../project-status/project-status-lib.mjs";
import { boardStatusOf, setBoardFields } from "./issue-board.mjs";
import {
  boardFieldsFor,
  commentBody,
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
  return env.GH_REPO || repoName(client);
}

/**
 * Creates the issue, then its board fields. A board that is not reachable does not undo the issue: a warning says which
 * fields are not set and who sets them (CI sets Typ, Epic and an empty Status; CI does not set Priority). It is never a
 * failure, because a failed `make issue` invites a retry, and a retry creates a duplicate issue (FR-DEV-10, P-10).
 */
export async function createIssue(client, input, { taxonomy, env = {}, log = console.log }) {
  const plan = validateNewIssue(input, taxonomy);
  if (!plan.ok) throw new IssueRefused(plan.errors);
  const repo = await repoOf(client, env);
  const { number, url } = await createIssueRest(client, {
    repo,
    title: plan.title,
    body: plan.body,
    labels: plan.labels,
  });
  log(`Created #${number}: ${url}`);
  try {
    await setBoardFields(client, { url, owner: repo.split("/")[0], fields: plan.fields });
    log(
      `Board: Status ${plan.fields.Status}, Typ ${plan.fields.Typ}, Epic ${plan.fields.Epic}, Priority ${plan.fields.Priority}`,
    );
    return { number, url, board: "set" };
  } catch (e) {
    log(`WARNING: #${number} is created, but its board fields are NOT set (${e.message}).`);
    log(
      `  Not set yet: Typ ${plan.fields.Typ}, Epic ${plan.fields.Epic}, Status ${plan.fields.Status}, Priority ${plan.fields.Priority}.`,
    );
    log(
      "  CI sets Typ, Epic and an empty Status once the labels are valid (issue-check.yml, App token). CI does not set Priority: set it by hand on the board.",
    );
    return { number, url, board: "missing" };
  }
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
 * overwritten (FR-DEV-10 (e)). When the Status cannot be read, Typ and Epic are still set, the Status is left as it is
 * and a warning says so (P-10: visible, not swallowed).
 */
export async function syncIssue(
  client,
  number,
  { type, epic, taxonomy, env = {}, log = console.log },
) {
  const fields = boardFieldsFor(taxonomy, type, epic);
  if (!fields) throw new IssueRefused([`unknown type "${type ?? ""}" or epic "${epic ?? ""}"`]);
  const repo = await repoOf(client, env);
  let status = null;
  let readError = null;
  try {
    status = await boardStatusOf(client, { repo, number });
  } catch (e) {
    readError = e;
  }
  // Status is written only when it is known to be empty; an unknown Status is left as it is.
  const wanted = !readError && !status ? { ...fields, Status: STATUS.todo } : fields;
  await setBoardFields(client, {
    url: issueUrl(repo, number),
    owner: repo.split("/")[0],
    fields: wanted,
  });
  if (readError)
    log(
      `#${number} board: Status not read (${readError.message}); Typ/Epic set, Status left as is`,
    );
  else
    log(
      `#${number} board: Typ ${fields.Typ}, Epic ${fields.Epic}, ${status ? `Status ${status} (kept)` : "Status Todo (set)"}`,
    );
  return wanted;
}
