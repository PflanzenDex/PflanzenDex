// The gate files a human has confirmed, and the question last asked, per branch (US-QG-07). The Claude Code hook asks about
// a gate file once per file per branch: after an edit of it went through, later edits of that file on that branch pass
// without a question. The records live in the git directory of the worktree (not tracked, not shared with the other
// worktrees), each keyed by the full ref of a branch:
// - claude-gate-confirmations.json: { "refs/heads/<branch>": ["<file>", ...] }, the confirmed gate files of each branch.
// - claude-gate-plan.json: the same shape, the gate files an agent declares for a branch with `make gate-plan`. A plan
//   confirms nothing. It makes one question name every planned file that is not confirmed yet. An agent can propose a
//   list, but it never confirms one: only the human's answer to a question does.
// - claude-gate-plan-asked.json: { "branch", "file", "list" }, the question last asked. After an edit of that file on that
//   branch went through, the list the question showed is confirmed and the snapshot is deleted. Every question rewrites
//   it, so an edit confirms only what its own question showed.
// Pure functions, tested in gate-confirmations.test.mjs. run.mjs and gate-plan.mjs read and write the records.
import path from "node:path";
import { asksBeforeEdit, isGateFile } from "./rules.mjs";

export const CONFIRMATIONS_FILE = "claude-gate-confirmations.json";
export const PLAN_FILE = "claude-gate-plan.json";
export const ASKED_FILE = "claude-gate-plan-asked.json";

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
  const wellFormed = Object.values(record).every(
    (files) => Array.isArray(files) && files.every((f) => typeof f === "string"),
  );
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

// The record text after every file of a list is confirmed on a branch: the list that one question showed (US-QG-07).
export function withConfirmations(text, branch, files) {
  return files.reduce((next, file) => withConfirmation(next, branch, file), text);
}

// Paths as the plan keeps them: normalized, relative to the top of the worktree, with no "./" (US-QG-07). A path that
// leaves the worktree or is absolute stays as it is and fails isGateFile.
export function normalizePaths(files) {
  return files.map((file) => path.posix.normalize(file));
}

// The plan record: { "<branch>": ["<gate file>", ...] }, or null when the text is missing, unreadable, not in that shape, or
// lists a path that is not a gate file. A gate test may be planned: it counts as a gate file here, it asks no question
// (questionFiles leaves it out) and make merge reviews it. Null makes the question name its own file alone (fail closed).
export function parsePlan(text) {
  if (typeof text !== "string") return null;
  let record;
  try {
    record = JSON.parse(text);
  } catch {
    return null;
  }
  if (record === null || typeof record !== "object" || Array.isArray(record)) return null;
  const wellFormed = Object.values(record).every(
    (files) => Array.isArray(files) && files.every((f) => typeof f === "string" && isGateFile(f)),
  );
  return wellFormed ? record : null;
}

// The gate files planned for a branch: the list, [] when the plan has no entry for the branch, null when it is unusable.
export function plannedFiles(planText, branch) {
  const plan = parsePlan(planText);
  if (plan === null) return null;
  return Object.hasOwn(plan, branch) ? plan[branch] : [];
}

// The files that one question names (US-QG-07). A file the plan lists shows every planned file of the branch that is not
// confirmed yet, the file itself included; a planned gate test asks no question, so it is left out. Any other file, and a plan
// that cannot be read, names the file alone.
export function questionFiles(file, planned, confirmedText, branch) {
  if (!planned?.includes(file)) return [file];
  const record = parseConfirmations(confirmedText);
  const confirmed = record !== null && Object.hasOwn(record, branch) ? record[branch] : [];
  return planned.filter((f) => f === file || (asksBeforeEdit(f) && !confirmed.includes(f)));
}

// The plan record after a branch declares its gate files (US-QG-07). Each path must be a gate file, so a refused list
// throws and nothing is written; a plan that cannot be read is replaced by the new one.
export function planWith(text, branch, files) {
  if (files.length === 0) throw new Error('no gate file is named (FILES="<gate file> ...")');
  const refused = files.filter((file) => !isGateFile(file));
  if (refused.length > 0) throw new Error(`not a gate file: ${refused.join(", ")}`);
  const plan = parsePlan(text) ?? {};
  return `${JSON.stringify({ ...plan, [branch]: [...new Set(files)].sort() }, null, 2)}\n`;
}

// The snapshot text of a question (US-QG-07): the branch, the gate file asked about and the list the question showed.
export function snapshotText(branch, file, list) {
  return `${JSON.stringify({ branch, file, list }, null, 2)}\n`;
}

// The list that an edit of `file` on `branch` confirms, from the snapshot of the last question, or null when the snapshot
// does not match: missing, unreadable, written for another file or branch, not naming the file, or listing a file that asks no
// question (a gate test). Null confirms nothing.
export function snapshotList(text, branch, file) {
  if (typeof text !== "string") return null;
  let snapshot;
  try {
    snapshot = JSON.parse(text);
  } catch {
    return null;
  }
  const list = snapshot?.list;
  const matches =
    snapshot?.branch === branch &&
    snapshot?.file === file &&
    Array.isArray(list) &&
    list.includes(file) &&
    list.every((f) => typeof f === "string" && asksBeforeEdit(f));
  return matches ? list : null;
}
