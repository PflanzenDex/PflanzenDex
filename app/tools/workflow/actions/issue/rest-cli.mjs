// REST reads and writes of one pull request or issue for agents (US-DEV-13): `make pr-state`, `make issue-read`,
// `make pr-text` and `make issue-comment`. Every call is `gh api` over REST, never GraphQL and never `gh pr` or `gh issue`:
// the GraphQL budget is shared, and a permission rule cannot tell a `gh api` read from a write, so these plain targets
// are what `.claude/settings.json` allows. The inputs come from the environment, never from the command line: the Makefile
// exports the raw make values (REST_PR, REST_ISSUE, REST_TITLE, REST_BODY) and writes no user text into a recipe, so a
// backtick or $(...) in a title, number or path is data and never a shell command.
// Usage: node rest-cli.mjs pr-state|issue-read|pr-text|issue-comment (the inputs are the REST_* variables above).
// Exit 0 ok, 1 GitHub failed (the message says so), 2 usage or input refused before any call. The transport is
// claim-client.mjs (realClient, json, repoName) and the paging of ci-wait.mjs (pagedKey).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { json, realClient, repoName } from "../../claim/lib/claim-client.mjs";
import { pagedKey } from "../ci-reuse/ci-wait.mjs";

class UsageError extends Error {}

const POSITIVE = /^[1-9]\d*$/;

/** The number of a command: a positive whole number, because it goes into the path of the call. */
function numberOf(value, noun) {
  if (!POSITIVE.test(value ?? ""))
    throw new UsageError(`${noun}=<n> must be a positive number, got "${value ?? ""}"`);
  return value;
}

/** The body file of a write: it must exist and hold text, so an empty body never replaces a real one. */
function requireBody(file) {
  if (!file) throw new UsageError("BODY=<file> is required: the file with the text to send");
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch (e) {
    throw new UsageError(
      `BODY file ${file} cannot be read (${e.code ?? e.message}); nothing was sent`,
    );
  }
  if (!text.trim()) throw new UsageError(`BODY file ${file} is empty; nothing was sent`);
}

const repoPath = async (client, tail) => `repos/${await repoName(client)}/${tail}`;
const names = (items, key) => (items?.length ? items.map((i) => i[key]).join(", ") : "none");

/** `pr-state`: the pull request as REST has it, and the latest run of each check on its head (filter=latest). */
async function prState(client, n) {
  const pr = await json(client, ["api", await repoPath(client, `pulls/${n}`)]);
  const checks = await pagedKey(
    client,
    await repoPath(client, `commits/${pr.head.sha}/check-runs?filter=latest`),
    "check_runs",
  );
  return [
    `PR #${n} "${pr.title}"`,
    `  state: ${pr.state}`,
    `  draft: ${pr.draft ? "yes" : "no"}`,
    `  merged: ${pr.merged ? "yes" : "no"}`,
    `  head: ${pr.head.sha}`,
    `  base: ${pr.base.ref}`,
    `  auto-merge: ${pr.auto_merge ? "on" : "off"}`,
    checks.length ? "  checks of the head (latest run of each):" : "  checks of the head: none",
    ...checks.map((c) => `    ${c.name}: ${c.status === "completed" ? c.conclusion : c.status}`),
  ].join("\n");
}

/** `issue-read`: title, state, labels, assignees and body. A pull request number is refused: it has its own reader. */
async function issueRead(client, n) {
  const issue = await json(client, ["api", await repoPath(client, `issues/${n}`)]);
  if (issue.pull_request)
    throw new UsageError(`#${n} is a pull request: use make pr-state PR=${n}`);
  return [
    `ISSUE #${n} "${issue.title}"`,
    `  state: ${issue.state}`,
    `  labels: ${names(issue.labels, "name")}`,
    `  assignees: ${names(issue.assignees, "login")}`,
    "",
    issue.body?.trim() ? issue.body : "(no body)",
  ].join("\n");
}

/** `pr-text`: sets the title (optional) and the body of a pull request; the body is read by gh from its file. */
async function prText(client, n, { title, bodyFile }) {
  const fields = [...(title ? ["-f", `title=${title}`] : []), "-F", `body=@${bodyFile}`];
  const pr = await json(client, [
    "api",
    "-X",
    "PATCH",
    await repoPath(client, `pulls/${n}`),
    ...fields,
  ]);
  return `PR #${n} ${title ? "title and body" : "body"} set: ${pr.html_url}`;
}

/** `issue-comment`: adds a comment whose text is the body file. */
async function issueComment(client, n, bodyFile) {
  const out = await json(client, [
    "api",
    "-X",
    "POST",
    await repoPath(client, `issues/${n}/comments`),
    "-F",
    `body=@${bodyFile}`,
  ]);
  return `comment added to #${n}: ${out.html_url}`;
}

const COMMANDS = {
  "pr-state": { noun: "PR", run: (c, n) => prState(c, n) },
  "issue-read": { noun: "ISSUE", run: (c, n) => issueRead(c, n) },
  "pr-text": {
    noun: "PR",
    check: (env) => requireBody(env.REST_BODY),
    run: (c, n, env) => prText(c, n, { title: env.REST_TITLE, bodyFile: env.REST_BODY }),
  },
  "issue-comment": {
    noun: "ISSUE",
    check: (env) => requireBody(env.REST_BODY),
    run: (c, n, env) => issueComment(c, n, env.REST_BODY),
  },
};

/** Runs one command and returns its text. Input problems throw UsageError; every other error is a failed GitHub call. */
export async function main(argv, { client = realClient(), env = process.env } = {}) {
  const command = COMMANDS[argv[0]];
  if (!command || argv.length !== 1)
    throw new UsageError(
      `usage: rest-cli.mjs ${Object.keys(COMMANDS).join("|")} (inputs: REST_PR, REST_ISSUE, REST_TITLE, REST_BODY)`,
    );
  // The number is checked before the body: a refused number never reaches a file or a call.
  const n = numberOf(env[`REST_${command.noun}`], command.noun);
  command.check?.(env);
  return command.run(client, n, env);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2))
    .then((text) => console.log(text))
    .catch((e) => {
      if (e instanceof UsageError) {
        console.error(`rest-cli: ${e.message}`);
        process.exitCode = 2;
      } else {
        console.error(`rest-cli: GitHub call failed: ${e.message}`);
        process.exitCode = 1;
      }
    });
}
