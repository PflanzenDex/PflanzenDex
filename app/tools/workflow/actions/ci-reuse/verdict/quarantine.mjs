// The quarantine list of the CI (US-QG-06): the jobs of ci.yml that report a red result but block no PR. The list is
// app/config/gates/baselines/quarantine-baseline.json, one entry per job: `job`, `since` (YYYY-MM-DD), `issue` and `reason`. Its
// format is a baseline format (BASELINE_FORMATS in .claude/hooks/baseline-growth.mjs): an entry or a raised maxEntries
// is growth that the owner merges, a removal is a shrink. Pure functions, no I/O: quarantine-cli.mjs reads the files,
// ci-verdict.mjs judges the rows of `make ci-wait` and `make merge` with the same functions as ci-status.
export const QUARANTINE_PATH = "app/config/gates/baselines/quarantine-baseline.json";

const JOB_NAME = /^[a-z][a-z0-9-]*$/;
const POSITIVE = /^[1-9]\d*$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const FIELDS = ["job", "since", "issue", "reason"];
const PASSING = new Set(["success", "skipped"]);

/** A red result: anything but success or skipped, as ci-status reads a `needs` result. */
export const isRed = (result) => !PASSING.has(result);

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function checkEntry(entry) {
  if (!isObject(entry)) throw new Error("the quarantine list: an entry is not an object");
  const extra = Object.keys(entry).filter((key) => !FIELDS.includes(key));
  if (extra.length) throw new Error(`the quarantine list: an entry has the field ${extra[0]}`);
  if (typeof entry.job !== "string" || !JOB_NAME.test(entry.job))
    throw new Error(`the quarantine list: "${entry.job}" is not a job id`);
  if (typeof entry.since !== "string" || !DAY.test(entry.since))
    throw new Error(`the quarantine list: ${entry.job} has no since date (YYYY-MM-DD)`);
  if (!Number.isInteger(entry.issue) || entry.issue < 1)
    throw new Error(`the quarantine list: ${entry.job} has no issue number`);
  if (typeof entry.reason !== "string" || entry.reason.trim() === "")
    throw new Error(`the quarantine list: ${entry.job} has no reason`);
}

/**
 * The list of a text, checked against the format: `{ maxEntries, entries }`. Text that does not parse, a field the format
 * does not know, more entries than maxEntries, or a job listed twice throws (fail closed: the list then judges nothing).
 */
export function parseQuarantine(text) {
  let root;
  try {
    root = JSON.parse(text);
  } catch {
    throw new Error("the quarantine list is not JSON");
  }
  if (!isObject(root)) throw new Error("the quarantine list: the top level is not an object");
  const extra = Object.keys(root).filter((key) => key !== "maxEntries" && key !== "entries");
  if (extra.length) throw new Error(`the quarantine list has the field ${extra[0]}`);
  if (!Number.isInteger(root.maxEntries) || root.maxEntries < 0)
    throw new Error("the quarantine list: maxEntries is not a whole number");
  if (!Array.isArray(root.entries)) throw new Error("the quarantine list: entries is not a list");
  if (root.entries.length > root.maxEntries)
    throw new Error(`the quarantine list lists ${root.entries.length} entries, above maxEntries`);
  const jobs = new Set();
  for (const entry of root.entries) {
    checkEntry(entry);
    if (jobs.has(entry.job)) throw new Error(`the quarantine list lists ${entry.job} twice`);
    jobs.add(entry.job);
  }
  return { maxEntries: root.maxEntries, entries: root.entries };
}

/** The entry of a job, or null when the job is not quarantined. */
export const entryOf = (entries, job) => entries.find((entry) => entry.job === job) ?? null;

/** The entries that name a job which the workflow does not define (`defined`: a Set of job ids of ci.yml). */
export const unknownJobs = (entries, defined) =>
  entries.map((entry) => entry.job).filter((job) => !defined.has(job));

// A list entry that names no job of the head's workflow is a problem: ci-status refuses such a list too (fail closed).
export const unknownProblems = (entries, defined) =>
  unknownJobs(entries, defined).map(
    (job) => `quarantine list names ${job}, which ci.yml does not define`,
  );

// The entry that excuses a red result of a quarantined job (US-QG-06), or null. A job that no run finished (running, never
// ran) is not excused: no run gave it a result.
export function heldBy(entries, job, result) {
  const entry = entryOf(entries, job);
  return entry && isRed(result) && !["running", "never ran"].includes(result) ? entry : null;
}

/**
 * Judges the results of the jobs (`results`: job id to result). A red job of the list is quarantined: it reports, and it
 * blocks nothing. Any other red job failed. `green` is true when no job failed.
 */
export function judgeJobs(results, entries) {
  const failed = [];
  const quarantined = [];
  for (const [job, result] of Object.entries(results)) {
    if (!isRed(result)) continue;
    const entry = entryOf(entries, job);
    if (entry) quarantined.push({ job, result, since: entry.since, issue: entry.issue });
    else failed.push({ job, result });
  }
  return { green: failed.length === 0, failed, quarantined };
}

/** The line that names a quarantined red job: on the step log and in the job summary (US-QG-06). */
export const quarantineLine = ({ job, result, since, issue }) =>
  `quarantined since ${since}, #${issue}: ${job} was ${result} (report only, US-QG-06)`;

/** The calendar day of a date in UTC, as YYYY-MM-DD (the `since` of a new entry). */
export function utcDay(now) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`;
}

/**
 * The text of the list with one more entry (`make quarantine`): the job must be a job of ci.yml other than ci-status, the
 * issue a positive number, the reason text and the job not listed yet. maxEntries rises by one, the growth the owner merges.
 */
export function addEntry(text, { job, issue, reason, since }, defined) {
  const { maxEntries, entries } = parseQuarantine(text);
  if (!JOB_NAME.test(job ?? "")) throw new Error(`JOB=<job> must be a job id, got "${job ?? ""}"`);
  if (job === "ci-status")
    throw new Error("ci-status is the aggregate of the jobs, it is not quarantined");
  if (!defined.has(job)) throw new Error(`${job} is not a job of ci.yml`);
  if (!POSITIVE.test(issue ?? ""))
    throw new Error(`ISSUE=<n> must be a positive number, got "${issue ?? ""}"`);
  if (!(reason ?? "").trim()) throw new Error('REASON="…" is required: why the job is red');
  if (entryOf(entries, job)) throw new Error(`${job} is already quarantined`);
  const next = {
    maxEntries: maxEntries + 1,
    entries: [...entries, { job, since, issue: Number(issue), reason: reason.trim() }],
  };
  return `${JSON.stringify(next, null, 2)}\n`;
}
