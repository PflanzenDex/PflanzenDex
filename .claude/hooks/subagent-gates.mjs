// The SubagentStop gate of the implementers (US-QG-07, US-DEV-02). When an implementer ends its work, `make gates` runs once
// in the worktree it worked in, unless a green stamp already covers the same commit and the same code, and a red run blocks
// the end once with its output. Pure functions and one `subagentStop(input, deps)`: run.mjs passes the git, file and process
// functions, the tests pass fakes (subagent-gates.test.mjs).
import fs from "node:fs";
import path from "node:path";

// The stamp of the last run, in the git directory of the worktree (`git rev-parse --git-path`). Its name does not start with
// the prefix of the hook records, so the orchestrator can read it with `cat`.
export const STAMP_NAME = "gates-stamp.json";
// The lock that keeps two runs of `make gates` from overlapping across all worktrees: it lives in the common git directory.
export const LOCK_NAME = "gates-run.lock";
// How long a run waits for the lock (`flock -w`) and how long `make gates` may take, together within the 900 s timeout of the
// SubagentStop hook (settings.json), so the hook always answers (starting values, assumption: `make gates` takes 1 to 4 min).
export const LOCK_WAIT_SECONDS = 300;
export const RUN_LIMIT_SECONDS = 540;
// The exit code of `flock -E` when the lock was not free in time: no run happened, so nothing is judged.
export const LOCK_BUSY_EXIT = 75;
const TAIL_LINES = 40;

// A `cd <folder> &&` at the start of a command or after `;`, `&`, `|`, `(` or a newline. The folder may be quoted.
const CD_PATTERN = /(?:^|[;&|(\n])\s*cd\s+(?:"([^"]+)"|'([^']+)'|(\S+))\s*&&/g;

// The commands of the Bash calls in one line of a transcript (JSON Lines: one message per line).
function bashCommands(line) {
  let entry;
  try {
    entry = JSON.parse(line);
  } catch {
    return [];
  }
  const content = entry?.message?.content;
  if (!Array.isArray(content)) return [];
  return content
    .filter((block) => block?.type === "tool_use" && block.name === "Bash")
    .map((block) => block.input?.command)
    .filter((command) => typeof command === "string");
}

// The folders that a command enters with `cd <folder> &&`, in order.
function cdFolders(command) {
  return [...command.matchAll(CD_PATTERN)].map((match) => match[1] ?? match[2] ?? match[3]);
}

// The worktree that holds a folder: the child of `worktreesDir` that contains it, so a `cd` into a folder of a worktree counts
// for that worktree. Null for a folder outside `worktreesDir`.
function worktreeOf(folder, worktreesDir) {
  if (!path.isAbsolute(folder)) return null;
  const [name] = path.relative(worktreesDir, folder).split(path.sep);
  if (!name || name === "..") return null;
  return path.join(worktreesDir, name);
}

// A linked worktree has a `.git` file that links it to the repository; the main checkout keeps a `.git` folder.
export function hasGitFile(folder) {
  try {
    return fs.statSync(path.join(folder, ".git")).isFile();
  } catch {
    return false;
  }
}

// The worktree the implementer worked in (US-QG-07): the last `cd <folder> &&` of its Bash calls that enters a worktree (a
// child of `worktreesDir` with a `.git` file). A `cd` anywhere else is ignored. Null when there is none.
export function worktreeFromTranscript(jsonlText, worktreesDir, isWorktree = hasGitFile) {
  if (!worktreesDir) return null;
  let found = null;
  for (const line of jsonlText.split("\n"))
    for (const command of bashCommands(line))
      for (const folder of cdFolders(command)) {
        const worktree = worktreeOf(folder, worktreesDir);
        if (worktree && isWorktree(worktree)) found = worktree;
      }
  return found;
}

// Whether `make gates` must run again (US-QG-07): not when a green stamp exists for this commit (head) and this code
// (fingerprint). Without a code change against origin/dev (fingerprint null) nothing runs.
export function needsRun(stamp, { head, fingerprint }) {
  if (!fingerprint) return false;
  return !(stamp?.exit === 0 && stamp.head === head && stamp.fingerprint === fingerprint);
}

// The names of the steps that failed, from the summary of run-gates.mjs (one `  FAILED <step>: re-run: ...` line per step).
export function failedSteps(output) {
  return [...output.matchAll(/^\s+FAILED (\S+?):/gm)].map((match) => match[1]);
}

// The last lines of a text, without the empty lines at its end.
function tailLines(text, count) {
  return text.replace(/\s+$/, "").split("\n").slice(-count).join("\n");
}

function parseStamp(text) {
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// The output of the SubagentStop hook of an implementer (US-QG-07): null when the hook stays silent, else the JSON for Claude
// Code. `deps` holds the functions that touch git, files and processes: worktreesDir (the .worktrees folder of the repository),
// isWorktree(folder), readFile(file) (the text, or null), writeFile(file, text), stampFile(worktree) (the stamp's path),
// head(worktree), fingerprint(worktree) (null without a code change), runGates(worktree) (→ { exit, output, durationMs }), now().
export function subagentStop(input, deps) {
  if (!input.agent_transcript_path) return null;
  const transcript = deps.readFile(input.agent_transcript_path);
  const worktree =
    transcript === null
      ? null
      : worktreeFromTranscript(transcript, deps.worktreesDir, deps.isWorktree);
  if (!worktree) return null;
  const head = deps.head(worktree);
  const fingerprint = deps.fingerprint(worktree);
  const stampFile = deps.stampFile(worktree);
  if (!needsRun(parseStamp(deps.readFile(stampFile)), { head, fingerprint })) return null;
  const { exit, output, durationMs } = deps.runGates(worktree);
  if (exit === LOCK_BUSY_EXIT)
    return {
      systemMessage: `make gates did not run in ${worktree}: another run held the lock for ${LOCK_WAIT_SECONDS} s. Run it before trusting the report (US-QG-07).`,
    };
  const stamp = {
    command: "make gates",
    exit,
    durationMs,
    head,
    fingerprint,
    at: deps.now(),
  };
  deps.writeFile(stampFile, `${JSON.stringify(stamp, null, 2)}\n`);
  if (exit === 0) return null;
  const steps = failedSteps(output);
  const detail = `Failed step: ${steps.join(", ") || "not named in the output"}. The last ${TAIL_LINES} lines:\n${tailLines(output, TAIL_LINES)}`;
  // The implementer was already asked to fix it once: a second block would loop, so the orchestrator is told instead.
  if (input.stop_hook_active)
    return {
      systemMessage: `make gates is still red in ${worktree} (exit ${exit}). ${detail}`,
    };
  return {
    decision: "block",
    reason: `make gates failed in ${worktree} (exit ${exit}). Fix it before you report: ${detail}`,
  };
}
