// US-QG-01 (issue 1667): the shard weights of the UI gates, measured in CI. Each shard job prints one Playwright list line per
// passed screen test; the median over several runs, with the speed of each runner job factored out (a job takes 0.65 to 1.24
// times the median time of the same screens), is the weight that register.ts splits the screens by.
//
// Usage: node tools/measure/ui-weights.mjs <run id> <run id> <run id> [...]   (make ui-weights RUNS="<id> <id> <id>")
// Reads the logs of the CI runs with gh (not the local app) and rewrites
// app/packages/e2e/support/display/one-screen/register.weights.json.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const WEIGHTS_FILE = fileURLToPath(
  new URL(
    "../../app/packages/e2e/support/display/one-screen/register.weights.json",
    import.meta.url,
  ),
);
const GATES = ["one-screen", "a11y-routes"];
const MIN_RUNS = 3;
// The shard jobs of ci.yml: `ui shard <n>` runs both gates, the earlier layout had one job per gate.
const SHARD_JOB = /^(ui shard|one-screen shard|a11y-routes shard) \d+$/;
// A passed screen test: "✓   2 [one-screen] › tests/accessibility/routes/one-screen.spec.ts:56:5 › … one screen: <id> (23.0s)".
// The gate is the Playwright project and the spec file of the same name, so the self-test specs do not match.
const PASSED =
  /✓\s+\d+ \[(one-screen|a11y-routes)\] › tests\/accessibility\/routes\/\1\.spec\.ts:\d+:\d+ › .*?(?:one screen|axe and keyboard walk): (\S+) \((\d+(?:\.\d+)?)(ms|s|m)\)/;

/** Seconds of a Playwright duration: "950ms", "23.6s" or "1.2m". */
function seconds(value, unit) {
  const number = Number(value);
  if (unit === "ms") return number / 1000;
  if (unit === "m") return number * 60;
  return number;
}

/** The passed screen tests of one shard job log: `{ gate, screen, sec }`. Failed and self-test lines are not screens. */
export function parseShardLog(text) {
  const samples = [];
  for (const line of text.split("\n")) {
    const match = PASSED.exec(line);
    if (match)
      samples.push({
        gate: match[1],
        screen: match[2],
        sec: seconds(match[3], match[4]),
      });
  }
  return samples;
}

/** The median of a non-empty list: the middle value, or the mean of the two middle values. */
export function median(values) {
  if (values.length === 0) throw new Error("ui-weights: the median of no value");
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

const keyOf = (sample) => `${sample.gate} ${sample.screen}`;

/** Groups values by key: a Map from the key to the list of its values, in order. */
function collect(pairs) {
  const groups = new Map();
  for (const [key, value] of pairs) {
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(value);
  }
  return groups;
}

const sortedByScreen = (table) =>
  Object.fromEntries(Object.entries(table).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

/**
 * The weights from the jobs (one array of samples per job): the raw median per screen and gate; per job a speed factor,
 * the median over its tests of seconds / raw median; then the median of every sample divided by its job's factor, rounded to
 * 0.1 s. Screens are sorted by id, so the file diffs stay small.
 */
export function weightsFrom(jobs) {
  for (const gate of GATES) {
    if (!jobs.some((job) => job.some((sample) => sample.gate === gate)))
      throw new Error(`ui-weights: no ${gate} test in the jobs, so its weights cannot be measured`);
  }
  const rawMedian = new Map(
    [...collect(jobs.flat().map((sample) => [keyOf(sample), sample.sec]))].map(([key, secs]) => [
      key,
      median(secs),
    ]),
  );
  const speeds = jobs.map((job) => {
    if (job.length === 0) throw new Error("ui-weights: a job without any passed screen test");
    return median(job.map((sample) => sample.sec / rawMedian.get(keyOf(sample))));
  });
  const normalized = collect(
    jobs.flatMap((job, index) => job.map((sample) => [keyOf(sample), sample.sec / speeds[index]])),
  );
  const weights = Object.fromEntries(GATES.map((gate) => [gate, {}]));
  for (const [key, secs] of normalized) {
    const [gate, screen] = key.split(" ");
    weights[gate][screen] = Math.round(median(secs) * 10) / 10;
  }
  return Object.fromEntries(GATES.map((gate) => [gate, sortedByScreen(weights[gate])]));
}

/** The file to write: the weights with the CI runs they come from and the command that refreshes them. */
export function weightsFile(weights, runIds) {
  return {
    source: `Median seconds per test of CI runs ${runIds.join(" ")} (list reporter of the shard jobs), each job's runner speed factored out; refresh with make ui-weights RUNS="<id> <id> <id>" (US-QG-01, issue 1667). A screen without an entry counts as the median of its gate.`,
    gates: Object.fromEntries(GATES.map((gate) => [gate, weights[gate]])),
  };
}

/** The run ids of the arguments, or an error: numbers only, at least three, each run once. */
export function checkRuns(args) {
  const notNumbers = args.filter((arg) => !/^\d+$/.test(arg));
  if (notNumbers.length > 0)
    throw new Error(
      `ui-weights: not a CI run id: ${notNumbers.join(" ")} (a run id is the number in the URL of the run)`,
    );
  if (args.length < MIN_RUNS)
    throw new Error(
      `ui-weights: at least ${MIN_RUNS} runs: one run's weights do not predict the split`,
    );
  const repeated = args.filter((arg, index) => args.indexOf(arg) !== index);
  if (repeated.length > 0)
    throw new Error(`ui-weights: each run once, repeated: ${repeated.join(" ")}`);
  return args;
}

function gh(args) {
  return execFileSync("gh", args, {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
}

/** The samples of each successful shard job of one CI run. */
function shardJobsOf(run) {
  const { jobs } = JSON.parse(gh(["run", "view", run, "--json", "jobs"]));
  const shards = jobs.filter((job) => SHARD_JOB.test(job.name) && job.conclusion === "success");
  if (shards.length === 0)
    throw new Error(
      `ui-weights: run ${run} has no successful shard job (ui shard, one-screen shard or a11y-routes shard)`,
    );
  return shards.map((job) => {
    const log = gh(["run", "view", run, "--job", String(job.databaseId), "--log"]);
    const samples = parseShardLog(log);
    if (samples.length === 0)
      throw new Error(`ui-weights: job "${job.name}" of run ${run} printed no passed screen test`);
    return samples;
  });
}

function main(args) {
  const runs = checkRuns(args);
  const jobs = runs.flatMap((run) => shardJobsOf(run));
  const weights = weightsFrom(jobs);
  writeFileSync(WEIGHTS_FILE, `${JSON.stringify(weightsFile(weights, runs), null, 2)}\n`);
  for (const gate of GATES) {
    const values = Object.values(weights[gate]);
    const sum = values.reduce((total, value) => total + value, 0);
    console.log(`${gate}: ${values.length} screens, sum of weights ${sum.toFixed(1)} s`);
  }
}

// Runs only as a script: the tests import the functions above.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
