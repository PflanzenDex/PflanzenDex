// Direction of a gate pull request (US-QG-07, `make gate-review`): does a limit, a baseline or an allowlist get looser?
// Pure functions over the text of one file before (the merge base) and after (the head); gate-review.mjs does the reading.
// Each judgement is the rule the existing gate already applies, so no second reading of a gate's meaning is made here:
//   baselines: baselineGrows of .claude/hooks/baseline-growth.mjs, the rule `make merge` applies (#1475);
//   numbers: gate-limits.mjs, a ceiling is looser when raised and a floor when lowered;
//   allowlists: an added entry tolerates more, a removed one less, a later expiry tolerates more (check-audit.mjs).
// Anything else is "read it". Nothing is called tighter or unchanged without such a proof (fail closed).
import { baselineGrows, isBaselineFile } from "../../../../../../.claude/hooks/baseline-growth.mjs";
import { isObject, parseJson } from "./gate-json.mjs";
import { judgeNumbers, numberRulesOf } from "./gate-limits.mjs";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ALLOWLISTS = new Map([
  ["app/config/gates/audit-allowlist.json", "audit"],
  ["app/config/gates/conformance-allowlist.json", "conformance"],
]);
const AUDIT_FIELDS = ["advisory", "package", "reason", "expires"];
const CONFORMANCE_FIELDS = ["story", "rule", "reason"];

/** The judgement a gate file gets, or null when no rule judges it. */
function kindOf(path) {
  if (isBaselineFile(path)) return "baseline";
  if (numberRulesOf(path)) return "numbers";
  return ALLOWLISTS.get(path) ?? null;
}

/** Whether the texts of a file are read: only a changed file that a rule judges (a new baseline is growth without a text). */
export const needsText = (path, status) => kindOf(path) !== null && status === "modified";

/** Why a gate file has no rule, named for the reader. */
function categoryOf(path) {
  if (path.startsWith(".github/workflows/")) return "a workflow";
  if (path.startsWith(".claude/hooks/") || path === ".claude/settings.json")
    return "a Claude Code hook";
  if (path.startsWith(".githooks/")) return "a Git hook";
  if (path === "Makefile") return "the Makefile";
  if (path.startsWith("app/tools/check/")) return "a check script";
  return "a gate file without a rule";
}

/** The entries of an allowlist, keyed by `idOf`; throws on an unknown field, a missing text or a duplicate. */
function entriesOf(text, fields, idOf) {
  const root = parseJson(text);
  if (!isObject(root) || !Array.isArray(root.entries)) throw new Error("it has no entries list");
  const extra = Object.keys(root).filter((k) => k !== "entries" && k !== "_comment");
  if (extra.length) throw new Error(`the top level has ${extra.join(", ")}`);
  const entries = new Map();
  for (const entry of root.entries) {
    if (!isObject(entry) || fields.some((f) => typeof entry[f] !== "string")) {
      throw new Error(`an entry lacks one of ${fields.join(", ")}`);
    }
    const unknown = Object.keys(entry).filter((k) => !fields.includes(k));
    if (unknown.length) throw new Error(`an entry has the field ${unknown.join(", ")}`);
    const id = idOf(entry);
    if (entries.has(id)) throw new Error(`${id} is listed twice`);
    entries.set(id, entry);
  }
  return entries;
}

function auditEntries(text) {
  const entries = entriesOf(text, AUDIT_FIELDS, (e) => e.advisory);
  for (const entry of entries.values()) {
    if (!DATE.test(entry.expires)) throw new Error(`${entry.advisory} has no date in expires`);
  }
  return entries;
}

/** Entries of both sides: an added id tolerates more, a removed one less; `both` judges an id present on both sides. */
function compareEntries(was, now, judged, both) {
  for (const [id, entry] of now) {
    if (!was.has(id)) judged.looser.push(`${id} added to the allowlist`);
    else both(id, was.get(id), entry, judged);
  }
  for (const id of was.keys()) {
    if (!now.has(id)) judged.tighter.push(`${id} removed from the allowlist`);
  }
}

function compareExpiry(id, old, entry, judged) {
  if (entry.expires > old.expires)
    judged.looser.push(`${id} expiry moved from ${old.expires} to ${entry.expires}`);
  else if (entry.expires < old.expires)
    judged.tighter.push(`${id} expiry moved from ${old.expires} to ${entry.expires}`);
}

/**
 * A baseline is judged by the rule of `make merge` (baseline-growth.mjs): growth in the forward direction is looser, and
 * growth in the reverse direction is tighter. Both texts must parse and have a known format, or the file is read it.
 */
function judgeBaseline(path, before, after, judged) {
  if (before === null) {
    judged.looser.push("a new baseline file, which baseline-growth.mjs counts as growth");
    return;
  }
  for (const text of [before, after]) {
    if (baselineGrows(path, text, text).grows)
      throw new Error("it does not parse, or its format is unknown");
  }
  judged.looser.push(...baselineGrows(path, before, after).reasons);
  if (baselineGrows(path, after, before).grows) judged.tighter.push("it shrinks");
}

const keyOfCheck = (e) => `${e.story} ${e.rule}`;

/** Judges the two texts of one file by its kind; `job` holds the path and both texts. */
function judgeText(kind, job, judged) {
  const { path, was, now } = job;
  if (kind === "baseline") judgeBaseline(path, was, now, judged);
  else if (kind === "numbers")
    judgeNumbers(numberRulesOf(path), parseJson(was), parseJson(now), judged);
  else if (kind === "audit")
    compareEntries(auditEntries(was), auditEntries(now), judged, compareExpiry);
  else
    compareEntries(
      entriesOf(was, CONFORMANCE_FIELDS, keyOfCheck),
      entriesOf(now, CONFORMANCE_FIELDS, keyOfCheck),
      judged,
      () => {},
    );
}

/** The text of a version, or the throw that makes the file read it. */
function textOf(version) {
  if (version === undefined) throw new Error("its text was not read");
  if (version.error) throw new Error(`its text cannot be read (${version.error})`);
  if (version.absent) throw new Error("it is absent on one side");
  return version.text;
}

/**
 * The judgement of one changed gate file. `before` and `after` are the texts at the merge base and at the head, each
 * `{ text }`, `{ absent: true }` or `{ error }`; they are passed only for a file that needsText. Every reason names the file.
 */
export function classifyFile({ path, status, before, after }) {
  const kind = kindOf(path);
  const judged = { looser: [], tighter: [], readIt: [] };
  try {
    if (kind === null) judged.readIt.push(categoryOf(path));
    else if (status === "added" && kind === "baseline") judgeBaseline(path, null, null, judged);
    else if (status !== "modified") judged.readIt.push(`the file is ${status}`);
    else judgeText(kind, { path, was: textOf(before), now: textOf(after) }, judged);
  } catch (err) {
    judged.readIt.push(`${err.message}, so read it`);
  }
  const named = (texts) => texts.map((t) => `${path}: ${t}`);
  return {
    path,
    looser: named(judged.looser),
    tighter: named(judged.tighter),
    readIt: named(judged.readIt),
  };
}

/**
 * The direction of a PR from the judgements of its gate files: looser when one change is proven looser (whatever else is
 * unclear), read it when something is unclear, tighter only when every change is proven tighter, otherwise unchanged.
 */
export function directionOf(judgements) {
  const looser = judgements.flatMap((j) => j.looser);
  const tighter = judgements.flatMap((j) => j.tighter);
  const readIt = judgements.flatMap((j) => j.readIt);
  const verdict = looser.length
    ? "looser"
    : readIt.length
      ? "read it"
      : tighter.length
        ? "tighter only"
        : "unchanged";
  return { verdict, looser, tighter, readIt };
}
