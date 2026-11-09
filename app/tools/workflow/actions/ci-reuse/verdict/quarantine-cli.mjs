// The command line of the quarantine list (US-QG-06): the reader that ci-status and the results job of ci.yml call, and the
// writer of `make quarantine`. Run from the top of the repository. The inputs come from the environment, never from the
// command line: the Makefile exports the raw make values (RAW_JOB, REST_ISSUE, RAW_REASON), and NEEDS_JSON is the
// `toJSON(needs)` of ci-status, passed through `env:`.
//   status                         ci-status: exit 1 when a job failed that the list does not quarantine
//   quarantined <job> <result>     results job: exit 0 when the job is quarantined and its result is red, else 1
//   add                            make quarantine: adds the entry, raises maxEntries by one, prints the next steps
// Exit 0 ok, 1 a failed or not quarantined job, 2 usage or an input or list that does not read or fit (fail closed).
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { jobsDefinedIn } from "./ci-verdict.mjs";
import {
  addEntry,
  entryOf,
  isRed,
  judgeJobs,
  parseQuarantine,
  QUARANTINE_PATH,
  quarantineLine,
  unknownJobs,
  utcDay,
} from "./quarantine.mjs";

const CI_YML = ".github/workflows/ci.yml";

class UsageError extends Error {}

/**
 * The entries of the list at `root`, checked against the jobs of its ci.yml: an entry that names a job the workflow does
 * not define throws, so a typo cannot hide a red job.
 */
export function readQuarantine(root) {
  const { entries } = parseQuarantine(readFileSync(join(root, QUARANTINE_PATH), "utf8"));
  const defined = jobsDefinedIn(readFileSync(join(root, CI_YML), "utf8"));
  const unknown = unknownJobs(entries, defined);
  if (unknown.length)
    throw new Error(
      `the quarantine list names ${unknown.join(", ")}, which ci.yml does not define`,
    );
  return entries;
}

/** The `needs` of ci-status as job id to result; an empty or unreadable object is a usage error. */
export function resultsOf(needsJson) {
  let needs;
  try {
    needs = JSON.parse(needsJson ?? "");
  } catch {
    throw new UsageError("NEEDS_JSON is not JSON (ci-status passes toJSON(needs))");
  }
  const jobs = Object.entries(needs ?? {});
  if (jobs.length === 0) throw new UsageError("NEEDS_JSON names no job, nothing to judge");
  return Object.fromEntries(jobs.map(([job, value]) => [job, value?.result ?? "missing"]));
}

/** Prints the lines and appends them to the job summary of the step, when there is one (GITHUB_STEP_SUMMARY). */
function report(lines, env) {
  for (const line of lines) console.log(line);
  if (env.GITHUB_STEP_SUMMARY && lines.length)
    appendFileSync(env.GITHUB_STEP_SUMMARY, `${lines.map((line) => `- ${line}`).join("\n")}\n`);
}

function status(root, env) {
  const judged = judgeJobs(resultsOf(env.NEEDS_JSON), readQuarantine(root));
  const lines = [
    ...judged.failed.map(({ job, result }) => `failed: ${job} (${result})`),
    ...judged.quarantined.map(quarantineLine),
  ];
  if (judged.green) lines.push("ci-status: green");
  report(lines, env);
  return judged.green ? 0 : 1;
}

function quarantined(root, job, result, env) {
  const entry = entryOf(readQuarantine(root), job ?? "");
  if (!entry || !isRed(result)) return 1;
  report([quarantineLine({ job, result, since: entry.since, issue: entry.issue })], env);
  return 0;
}

function add(root, env, now) {
  const listPath = join(root, QUARANTINE_PATH);
  const defined = jobsDefinedIn(readFileSync(join(root, CI_YML), "utf8"));
  const since = utcDay(now);
  const next = addEntry(
    readFileSync(listPath, "utf8"),
    { job: env.RAW_JOB, issue: env.REST_ISSUE, reason: env.RAW_REASON, since },
    defined,
  );
  writeFileSync(listPath, next);
  const { maxEntries, entries } = parseQuarantine(next);
  const entry = entries[entries.length - 1];
  console.log(
    `quarantine: ${entry.job} is listed since ${since} for #${entry.issue}; maxEntries is ${maxEntries}.`,
  );
  console.log(
    "Next (US-QG-06): the list grows, so the owner merges the change, as for any baseline:",
  );
  console.log(`  git add ${QUARANTINE_PATH}`);
  console.log(`  git commit -m "chore(qg): quarantine ${entry.job} (#${entry.issue})"`);
  console.log(`  open a pull request into dev that names #${entry.issue}; the owner merges it.`);
  return 0;
}

/** Runs one command; returns the exit code. Errors are printed and exit 2, never swallowed. */
export function main(argv, env, root, now = new Date()) {
  try {
    const [command, ...args] = argv;
    if (command === "status") return status(root, env);
    if (command === "quarantined") return quarantined(root, args[0], args[1], env);
    if (command === "add") return add(root, env, now);
    throw new UsageError("usage: quarantine-cli.mjs status|quarantined <job> <result>|add");
  } catch (err) {
    console.error(`quarantine: ${err.message}`);
    return 2;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2), process.env, process.cwd());
}
