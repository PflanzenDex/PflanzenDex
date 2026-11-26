// The gate files a branch allows, and the plan of the branch (US-QG-07, issue 2554). The Claude Code hook asks before every
// edit of a gate file. An answer to one question covers that one edit and is recorded nowhere. Only the owner's
// `make gate-allow` (gate-allow.mjs) records a file as allowed for the rest of the branch. The records live in the git
// directory of the worktree (not tracked, not shared with the other worktrees), each keyed by the full ref of a branch:
// - claude-gate* confirmations (CONFIRMATIONS_FILE): { "refs/heads/<branch>": ["<file>", ...] }, the allowed gate files.
// - claude-gate* plan (PLAN_FILE): the same shape, the gate files an agent declares for a branch with `make gate-plan`.
//   A plan allows nothing and asks nothing. make gate-plan refuses a listed file that already differs from origin/dev and
//   that no owner allowed (unconfirmedChanged).
// Pure functions, tested in gate-confirmations.test.mjs. run.mjs, gate-plan.mjs and gate-allow.mjs read and write the records.
import path from "node:path";
import { asksBeforeEdit, isGateFile } from "./rules.mjs";

export const CONFIRMATIONS_FILE = "claude-gate-confirmations.json";
export const PLAN_FILE = "claude-gate-plan.json";

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

// The record text after every file of a list is allowed on a branch: the list that make gate-allow names (US-QG-07, issue 2554).
export function withConfirmations(text, branch, files) {
  return files.reduce((next, file) => withConfirmation(next, branch, file), text);
}

// Paths as the plan keeps them: normalized, relative to the top of the worktree, with no "./" (US-QG-07). A path that
// leaves the worktree or is absolute stays as it is and fails isGateFile.
export function normalizePaths(files) {
  return files.map((file) => path.posix.normalize(file));
}

// The plan record: { "<branch>": ["<gate file>", ...] }, or null when the text is missing, unreadable, not in that shape, or
// lists a path that is not a gate file. A gate test may be planned: it counts as a gate file here, and make merge reviews it.
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

// The listed gate files that a change has already made and that no owner allowed (US-QG-07, issue 2554): a file that asks, is not
// allowed on the branch, and differs from origin/dev. `differs(file)` tells whether a file differs. It is asked only for a file
// that asks and is not allowed yet, so a gate test or an allowed file costs no check.
export function unconfirmedChanged(files, differs, confirmedText, branch) {
  return files.filter(
    (file) => asksBeforeEdit(file) && needsQuestion(file, branch, confirmedText) && differs(file),
  );
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
