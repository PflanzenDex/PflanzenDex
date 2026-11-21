// The push check of a subagent (US-QG-07, issue 2371): when an implementer or a ticket lead stops and the origin head of its
// branch did not move during its run, the hook adds "no new commit pushed on <branch>" as a system message. It never blocks
// (no decision; `hookSpecificOutput.additionalContext` would make a SubagentStop subagent continue) and it reads git only: no
// fetch, no push, no write. Pure functions and one `subagentPush(input, deps)`: run.mjs passes the git and file functions, the
// tests pass fakes (subagent-push.test.mjs).
import { worktreeFromTranscript } from "./subagent-gates.mjs";

// The worktrees of the repository that the transcript entered with `cd <folder> &&`, in order of first entry. The function of
// subagent-gates.mjs reports only the last one, but it asks its predicate about every worktree it finds: the predicate collects
// them here, so the existing transcript reader is reused and not copied.
function worktreesOf(jsonlText, deps) {
  const found = [];
  worktreeFromTranscript(jsonlText, deps.worktreesDir, (worktree) => {
    const accepted = deps.isWorktree(worktree);
    if (accepted && !found.includes(worktree)) found.push(worktree);
    return accepted;
  });
  return found;
}

// The start of the run in whole seconds: the first timestamp of the transcript (JSON Lines), null when there is none.
export function runStartSeconds(jsonlText) {
  for (const line of jsonlText.split("\n")) {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const ms = typeof entry?.timestamp === "string" ? Date.parse(entry.timestamp) : Number.NaN;
    if (Number.isFinite(ms)) return Math.floor(ms / 1000);
  }
  return null;
}

// The reflog entries of refs/remotes/origin/<branch> as `git log -g --date=unix --format="%H %gD"` prints them, newest first:
// each line ends with the reflog selector `@{<epoch seconds>}`. Other lines are skipped.
export function parseReflog(text) {
  const entries = [];
  for (const line of text.split("\n")) {
    const match = /^([0-9a-f]{40,64}) .*@\{(\d+)\}$/.exec(line.trim());
    if (match) entries.push({ sha: match[1], time: Number(match[2]) });
  }
  return entries;
}

// The origin head of a branch when the run started: the newest reflog entry written in an earlier whole second than the start,
// null when there is none (a branch first pushed during the run has none). A push in the start's own second is not counted as
// before the run. `git rev-parse <ref>@{<time>}` is not used: before the oldest entry it answers that oldest entry, which would
// make a branch first pushed during the run look as if it did not move.
export function headAtStart(entries, startSeconds) {
  return entries.find((entry) => entry.time < startSeconds)?.sha ?? null;
}

// The message for one worktree whose origin head did not move during the run, null otherwise (US-QG-07). Anything unknown (a
// detached HEAD, no entry before the start, no origin ref, a git error) says nothing, so the check never flags on a guess.
function unmovedNote(worktree, startSeconds, deps) {
  try {
    const branch = deps.branchOf(worktree);
    if (!branch) return null;
    const before = headAtStart(parseReflog(deps.reflogText(worktree, branch)), startSeconds);
    const after = deps.remoteHead(worktree, branch);
    if (before === null || after === null || before !== after) return null;
    return `Heads-up: no new commit pushed on ${branch}: origin/${branch} did not move during this run (worktree ${worktree}). Check the branch before you trust the report (US-QG-07).`;
  } catch {
    // git could not answer for this worktree: it says nothing about it, and the other worktrees are still checked.
    return null;
  }
}

// The output of the SubagentStop push check (US-QG-07, issue 2371): null when the hook stays silent, else { systemMessage }.
// `deps` holds the functions that touch git and files: worktreesDir (the .worktrees folder of the repository, null when
// unknown), isWorktree(folder), readFile(file) (the text, or null), branchOf(worktree) (the short branch name, null when
// detached), remoteHead(worktree, branch) (the sha of refs/remotes/origin/<branch>, null when there is none), reflogText(worktree,
// branch) (the output of git log -g, see parseReflog). Any error ends in silence: the hook never breaks a stop.
export function subagentPush(input, deps) {
  try {
    const transcript = input?.agent_transcript_path
      ? deps.readFile(input.agent_transcript_path)
      : null;
    if (transcript === null) return null;
    const startSeconds = runStartSeconds(transcript);
    if (startSeconds === null) return null;
    const notes = worktreesOf(transcript, deps)
      .map((worktree) => unmovedNote(worktree, startSeconds, deps))
      .filter((note) => note !== null);
    return notes.length > 0 ? { systemMessage: notes.join("\n") } : null;
  } catch {
    return null;
  }
}
