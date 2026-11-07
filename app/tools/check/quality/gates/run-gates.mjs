// `npm run gates` (US-QG-01): runs the gate steps of gate-steps.mjs in parallel, at most GATE_PARALLEL_LIMIT at a time.
// Every step runs, also after a failure. A step's output is buffered and printed whole when the step ends, so lines of
// different steps never interleave. At the end every failed step is named with the command that re-runs it. A run in
// which every step passed is recorded for its exact content (issue 1608), and the same content skips the steps next time.
// CI reads and writes no record.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ESLINT_SHARED, GATE_PARALLEL_LIMIT, GATE_STEPS, runGateSteps } from "./gate-steps.mjs";
import { RESULTS_ENV } from "./eslint-shared.mjs";

const APP_DIR = fileURLToPath(new URL("../../../../", import.meta.url));
const DEFAULT_CACHE_DIR = path.join(APP_DIR, ".cache", "gates");
// The record of a green result (issue 1608), in the git directory of the worktree: { "key": <sha-256>, "passedAt": <time> }.
const GREEN_FILE = "gates-green.json";

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

// Git in cwd, without the variables of an outer hook (a hook sets GIT_DIR and GIT_INDEX_FILE). Throws unless `strict`
// is false.
function git(cwd, args, extra = {}, strict = true) {
  const dropped = ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"];
  const base = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !dropped.includes(name)),
  );
  const out = spawnSync("git", args, { cwd, encoding: "utf8", env: { ...base, ...extra } });
  if (out.status !== 0 && strict) throw new Error(`git ${args.join(" ")}: ${out.stderr.trim()}`);
  return out.stdout.trim();
}

// The tree of the working copy (issue 1608): committed, uncommitted and untracked files that are not ignored. `git add -A`
// runs on a copy of the real index in the git directory, which is removed again, so the real index stays untouched.
function workingTree(top, gitDir) {
  const temp = path.join(gitDir, `gates-index-${process.pid}`);
  try {
    fs.copyFileSync(path.join(gitDir, "index"), temp);
    const index = { GIT_INDEX_FILE: temp };
    git(top, ["add", "-A"], index);
    return git(top, ["write-tree"], index);
  } finally {
    fs.rmSync(temp, { force: true });
  }
}

// The top of the worktree of an app folder, its git directory and the file of the record there (issue 1608).
function placeOf(appDir) {
  const gitDir = git(appDir, ["rev-parse", "--absolute-git-dir"]);
  return {
    top: git(appDir, ["rev-parse", "--show-toplevel"]),
    gitDir,
    file: path.join(gitDir, GREEN_FILE),
  };
}

// The key of the content a green result stands for (issue 1608): the tree of the working copy, the commit of origin/dev
// ("" when missing), the lock stamp, the Node version and DUPLICATES_BASE. It throws when one part cannot be read.
function contentKey(appDir, env, place) {
  const dev = git(appDir, ["rev-parse", "-q", "--verify", "origin/dev"], {}, false);
  const stamp = fs.readFileSync(path.join(appDir, "node_modules", ".setup-lock-hash"), "utf8");
  const parts = [
    workingTree(place.top, place.gitDir),
    dev,
    stamp,
    process.version,
    env.DUPLICATES_BASE ?? "",
  ];
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

const firstLine = (error) => String(error.message).split("\n")[0];

// The time that the record says this key passed, or null when the record holds another key. A missing record is normal;
// a record that cannot be read throws.
function storedPass(file, key) {
  if (!fs.existsSync(file)) return null;
  const stored = JSON.parse(fs.readFileSync(file, "utf8"));
  return stored.key === key && typeof stored.passedAt === "string" ? stored.passedAt : null;
}

// The start of a run (issue 1608): the place of the record, the key of this content and the time it passed, when the
// record holds this key. CI gets no start: it reads and writes nothing. FRESH=1 reads no record but still records a pass.
// A problem with the key or the record runs the steps and says so; it never fails the run.
function greenStart({ appDir, env, write }) {
  if (env.CI !== undefined) return null;
  const start = { place: null, key: null, passedAt: null };
  try {
    start.place = placeOf(appDir);
    start.key = contentKey(appDir, env, start.place);
    if (env.FRESH === undefined) start.passedAt = storedPass(start.place.file, start.key);
  } catch (error) {
    write(`gates: the green result is not used (${firstLine(error)})\n`);
  }
  return start;
}

// After the steps (issue 1608): a failed run removes the record, whatever it held. A passed run writes its record only when
// the content still has the key of the start, so an edit during the run writes nothing.
function finishGreen({ start, passed, appDir, env, write }) {
  if (!start?.place) return;
  try {
    if (!passed) fs.rmSync(start.place.file, { force: true });
    else if (start.key !== null && contentKey(appDir, env, start.place) === start.key) {
      const passedAt = new Date().toISOString();
      fs.writeFileSync(start.place.file, `${JSON.stringify({ key: start.key, passedAt })}\n`);
    }
  } catch (error) {
    write(`gates: the green result is not remembered (${firstLine(error)})\n`);
  }
}

// Runs the steps and prints them. Returns the exit code: 1 when a step failed, else 0. The shared ESLint pass writes into a
// file of this run that every step gets through GATES_ESLINT_RESULTS. A green record of this exact content skips the steps.
export async function runGates({
  steps = GATE_STEPS,
  runOne = runArgv,
  write = (text) => process.stdout.write(text),
  cacheDir = DEFAULT_CACHE_DIR,
  appDir = APP_DIR,
  gateEnv = process.env,
} = {}) {
  const start = greenStart({ appDir, env: gateEnv, write });
  if (start?.passedAt) {
    write(`gates: skipped, this exact content passed at ${start.passedAt} (FRESH=1 runs them)\n`);
    return 0;
  }
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
  } catch (error) {
    finishGreen({ start, passed: false, appDir, env: gateEnv, write });
    throw error;
  } finally {
    fs.rmSync(sharedFile, { force: true });
  }
  write(summarize(results, (performance.now() - started) / 1000));
  const passed = results.every((result) => result.ok);
  finishGreen({ start, passed, appDir, env: gateEnv, write });
  return passed ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await runGates();
}
