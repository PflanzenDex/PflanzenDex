#!/usr/bin/env node
// The warning tier of the accessibility gate (US-QG-02, owner decision d-190, issue 2666): the nightly job `nightly-a11y-report`
// counts the findings of its runs (200 % text, forced colors, reduced motion) and keeps them in ONE rolling issue with the label
// `a11y-nightly`. It never fails a job and never blocks a release; a missing results file is "unknown", never 0 (P-10).
// The CI step calls `make a11y-warning-report`, which runs `publish` with the environment WARN_DIR (the folder of the three results
// files) and RUN_URL (the link of the run); GH_TOKEN and GH_REPO come from the job. `count <one-screen|a11y> <results.json>` prints
// one count for a person or a script.
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** The label of the rolling issue and the title it is made with. */
export const LABEL = "a11y-nightly";
export const TITLE = "Accessibility warnings of the nightly run";
/** A count is a number of findings, or the word unknown when the run left no results (never a silent 0). */
export const UNKNOWN = "unknown";

/** The three result files of the warning tier, in the folder WARN_DIR (written by the job before this step). */
export const FILES = {
  text200: "one-screen.json",
  forcedColors: "a11y-forced.json",
  reducedMotion: "a11y-reduced.json",
};

/** One-screen results with at least one failure: the number of screen and size pairs that do not fit in one run. */
export function countOneScreen(results) {
  return results.filter((result) => Array.isArray(result.failures) && result.failures.length > 0)
    .length;
}

/** The accessibility findings of a run: the elements counted over every screen, size, check and rule. */
export function countA11y(results) {
  return results.reduce(
    (sum, result) =>
      sum + (result.findings ?? []).reduce((n, finding) => n + (finding.count ?? 0), 0),
    0,
  );
}

/** The count of one results file of a gate, or unknown when the file is missing or is not a list of results. */
export function countFile(kind, text) {
  if (text === undefined) return UNKNOWN;
  const results = JSON.parse(text);
  if (!Array.isArray(results)) return UNKNOWN;
  return String(kind === "one-screen" ? countOneScreen(results) : countA11y(results));
}

/** The counts of the three warning runs in `dir`, each unknown when its file is missing. `read` returns a text or undefined. */
export function countsIn(dir, read) {
  const text = (name) => read(join(dir, name));
  return {
    text200: countFile("one-screen", text(FILES.text200)),
    forcedColors: countFile("a11y", text(FILES.forcedColors)),
    reducedMotion: countFile("a11y", text(FILES.reducedMotion)),
  };
}

/** The calendar day of a run as YYYY-MM-DD in the time zone of the runner (not a UTC slice of the ISO text). */
export function dayOf(date) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** The line of one run in the rolling issue: date, link, then the three counts of the warning tier. */
export function runLine({ date, runUrl, counts }) {
  return (
    `- ${date}, [run](${runUrl}): 200 % text: ${counts.text200}, ` +
    `forced colors: ${counts.forcedColors}, reduced motion: ${counts.reducedMotion}`
  );
}

const HEADING = [
  "# Accessibility warnings of the nightly run (US-QG-02, issue 2666)",
  "",
  "The warning tier of the nightly run on `dev` (`nightly-a11y-report`): one-screen at 200 % text, the accessibility walk under",
  "forced colors and under reduced motion. It never fails a job and never blocks a release. Each run adds one line below",
  "(`unknown` means the run left no results). The blocking tier is `nightly-a11y`.",
  "",
];

/** The body of the rolling issue, written when the issue is made, with the first run line. */
export function renderIssueBody(run) {
  return [...HEADING, runLine(run), ""].join("\n");
}

/** The comment that the rolling issue gets for each later run. */
export function renderComment(run) {
  return runLine(run) + "\n";
}

/** The gh call of the CLI: its arguments as a list (no shell), its standard output as text; it throws on a failed call. */
export function ghCall(args) {
  return execFileSync("gh", args, { encoding: "utf8" });
}

/**
 * Keeps the rolling issue up to date with the counts of this run (report only, US-QG-02): the label once, then a comment on the
 * open issue, or the issue itself when none is open. `gh` runs one gh command and returns its standard output; a run that
 * cannot write the issue throws, so the step shows it (P-10).
 */
export function publish({ dir, runUrl, day, read, write = writeFileSync, gh = ghCall }) {
  const run = { date: day, runUrl, counts: countsIn(dir, read) };
  try {
    gh([
      "label",
      "create",
      LABEL,
      "--color",
      "D4C5F9",
      "--description",
      "Warning tier of the nightly accessibility run (US-QG-02)",
    ]);
  } catch (error) {
    if (!String(error?.stderr ?? error?.message ?? "").includes("already exists")) throw error;
  }
  const open = JSON.parse(
    gh(["issue", "list", "--label", LABEL, "--state", "open", "--json", "number"]) || "[]",
  );
  if (open.length > 0) {
    const file = join(dir, "comment.md");
    write(file, renderComment(run));
    gh(["issue", "comment", String(open[0].number), "--body-file", file]);
    return `a11y-nightly: comment on #${open[0].number} (${JSON.stringify(run.counts)})`;
  }
  const file = join(dir, "body.md");
  write(file, renderIssueBody(run));
  const url = gh([
    "issue",
    "create",
    "--label",
    `${LABEL},report`,
    "--title",
    TITLE,
    "--body-file",
    file,
  ]).trim();
  return `a11y-nightly: issue created ${url} (${JSON.stringify(run.counts)})`;
}

const readOptional = (path) => {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
};

/** The CLI: `count` prints one number (or unknown); `publish` takes WARN_DIR and RUN_URL from the environment. */
export function main(argv, env = process.env, deps = {}) {
  const [command, ...rest] = argv;
  if (command === "count") {
    const [kind, path] = rest;
    if ((kind !== "one-screen" && kind !== "a11y") || !path)
      throw new Error("usage: count <one-screen|a11y> <results.json>");
    return countFile(kind, readOptional(path));
  }
  if (command === "publish") {
    if (!env.WARN_DIR || !env.RUN_URL) throw new Error("publish: WARN_DIR and RUN_URL must be set");
    const day = dayOf((deps.now ?? (() => new Date()))());
    return publish({ dir: env.WARN_DIR, runUrl: env.RUN_URL, day, read: readOptional, ...deps });
  }
  throw new Error("usage: report.mjs <count|publish> ...");
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(main(process.argv.slice(2)) + "\n");
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}
