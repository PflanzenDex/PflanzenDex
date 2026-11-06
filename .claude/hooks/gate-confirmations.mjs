// The gate files a human has confirmed, per branch (US-QG-07). The Claude Code hook asks about a gate file once per file
// per branch: after an edit of it went through, later edits of that file on that branch pass without a question. The
// record lives in the git directory of the worktree (not tracked, not shared with the other worktrees) as one JSON object
// from the full ref of a branch to the gate files confirmed on it: { "refs/heads/<branch>": ["<file>", ...] }.
// Pure functions, tested in gate-confirmations.test.mjs. run.mjs reads and writes the record.

export const CONFIRMATIONS_FILE = "claude-gate-confirmations.json";

// The record as an object, or null when the text is missing or not in that shape. Null makes the caller ask (fail closed).
export function parseConfirmations(text) {
  if (typeof text !== "string") return null;
  let record;
  try {
    record = JSON.parse(text);
  } catch {
    return null;
  }
  if (record === null || typeof record !== "object" || Array.isArray(record)) return null;
  const wellFormed = Object.values(record).every((files) => Array.isArray(files) && files.every((f) => typeof f === "string"));
  return wellFormed ? record : null;
}

// Whether an edit of this gate file needs the human's question. It does without a branch (a detached HEAD), without a
// usable record, and until the file is recorded as confirmed on this branch.
export function needsQuestion(file, branch, text) {
  const record = branch ? parseConfirmations(text) : null;
  return !(record !== null && Object.hasOwn(record, branch) && record[branch].includes(file));
}

// The record text after one more confirmed gate file on a branch. A record that cannot be parsed is replaced: the files it
// held ask again, which is the safe side.
export function withConfirmation(text, branch, file) {
  const record = parseConfirmations(text) ?? {};
  const files = new Set(Object.hasOwn(record, branch) ? record[branch] : []);
  files.add(file);
  return `${JSON.stringify({ ...record, [branch]: [...files].sort() }, null, 2)}\n`;
}
