// `npm run gates` (US-QG-01): runs the gate steps of gate-steps.mjs in parallel, at most GATE_PARALLEL_LIMIT at a time.
// Every step runs, also after a failure. A step's output is buffered and printed whole when the step ends, so lines of
// different steps never interleave. At the end every failed step is named with the command that re-runs it.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ESLINT_SHARED, GATE_PARALLEL_LIMIT, GATE_STEPS } from "./gate-steps.mjs";
import { RESULTS_ENV } from "./eslint-shared.mjs";

const APP_DIR = fileURLToPath(new URL("../../../", import.meta.url));
const DEFAULT_CACHE_DIR = path.join(APP_DIR, ".cache", "gates");

const isReady = (finished) => (step) => (step.needs ?? []).every((name) => finished.has(name));

function validateSteps(steps, limit) {
  if (!Number.isInteger(limit) || limit < 1)
    throw new RangeError(`the parallel limit must be a whole number from 1, got ${limit}`);
  const names = new Set(steps.map((step) => step.name));
  if (names.size !== steps.length) throw new Error("gate step names must be unique");
  for (const step of steps)
    for (const need of step.needs ?? [])
      if (!names.has(need)) throw new Error(`gate step ${step.name} needs unknown step ${need}`);
}

// Starts each step once a slot is free and every step in its `needs` has finished. A failed step counts as finished:
// its dependents still run and report what they miss. The table order decides which ready step starts first.
// `runStep` resolves to { name, ok, output, seconds }; a rejected run counts as a failed step.
export function runGateSteps(steps, { limit = GATE_PARALLEL_LIMIT, runStep, onDone = () => {} }) {
  validateSteps(steps, limit);
  return new Promise((resolve, reject) => {
    const waiting = [...steps];
    const finished = new Set();
    const results = [];
    let running = 0;
    const settle = (result) => {
      running -= 1;
      finished.add(result.name);
      results.push(result);
      onDone(result);
      launch();
    };
    const launch = () => {
      let index = waiting.findIndex(isReady(finished));
      while (running < limit && index >= 0) {
        const [step] = waiting.splice(index, 1);
        running += 1;
        Promise.resolve()
          .then(() => runStep(step))
          .catch((error) => ({ name: step.name, ok: false, output: `${error}\n`, seconds: 0 }))
          .then(settle);
        index = waiting.findIndex(isReady(finished));
      }
      if (running > 0) return;
      if (waiting.length > 0)
        reject(new Error(`gate steps cannot start: ${waiting.map((s) => s.name).join(", ")}`));
      else resolve(results);
    };
    launch();
  });
}

// Runs one step as a child process in app/. Its output (stdout and stderr) is buffered and decoded once.
export function runArgv(step, env = process.env) {
  const started = performance.now();
  return new Promise((resolve) => {
    const chunks = [];
    const finish = (code) =>
      resolve({
        name: step.name,
        ok: code === 0,
        output: Buffer.concat(chunks).toString("utf8"),
        seconds: (performance.now() - started) / 1000,
      });
    const child = spawn(step.argv[0], step.argv.slice(1), {
      cwd: APP_DIR,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.stderr.on("data", (chunk) => chunks.push(chunk));
    child.on("error", (error) => {
      chunks.push(Buffer.from(`${error.message}\n`));
      finish(1);
    });
    child.on("close", (code) => finish(code));
  });
}

// One step as printed: a header line and the whole buffered output, as one string.
export function formatBlock(result) {
  const body =
    result.output === "" || result.output.endsWith("\n") ? result.output : `${result.output}\n`;
  return `--- ${result.name}: ${result.ok ? "ok" : "FAILED"} in ${result.seconds.toFixed(1)} s\n${body}`;
}

const rerunCommand = (name) => (name === ESLINT_SHARED ? "npm run gates" : `npm run ${name}`);

// The last lines of a run: the step count and every failed step with the command that re-runs it.
export function summarize(results, seconds) {
  const failed = results.filter((result) => !result.ok);
  const head = `gates: ${results.length} steps in ${seconds.toFixed(1)} s, at most ${GATE_PARALLEL_LIMIT} at a time, ${failed.length} failed`;
  const lines = failed.map(
    (result) => `  FAILED ${result.name}: re-run: ${rerunCommand(result.name)}`,
  );
  return `${[head, ...lines].join("\n")}\n`;
}

// Runs the steps and prints them. Returns the exit code: 1 when a step failed, else 0.
// The shared ESLint pass writes into a file of this run that every step gets through GATES_ESLINT_RESULTS.
export async function runGates({
  steps = GATE_STEPS,
  runOne = runArgv,
  write = (text) => process.stdout.write(text),
  cacheDir = DEFAULT_CACHE_DIR,
} = {}) {
  fs.mkdirSync(cacheDir, { recursive: true });
  const sharedFile = path.join(cacheDir, `eslint-shared-${process.pid}.json`);
  fs.rmSync(sharedFile, { force: true });
  const env = { ...process.env, [RESULTS_ENV]: sharedFile };
  const started = performance.now();
  let results;
  try {
    results = await runGateSteps(steps, {
      runStep: (step) => runOne(step, env),
      onDone: (result) => write(formatBlock(result)),
    });
  } finally {
    fs.rmSync(sharedFile, { force: true });
  }
  write(summarize(results, (performance.now() - started) / 1000));
  return results.some((result) => !result.ok) ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await runGates();
}
