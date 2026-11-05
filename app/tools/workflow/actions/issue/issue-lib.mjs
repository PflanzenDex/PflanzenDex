// Pure rules of the issue labels (FR-DEV-10, US-DEV-05): which labels an issue needs, what the comment on an invalid
// issue says, which board options follow the labels, and what `make issue` accepts. No I/O here: issue.mjs reads and
// writes GitHub, issue-board.mjs writes the project. The allowed list is app/config/project/issue-taxonomy.json.
import { REPORT_LABEL, TRIAGE_LABEL } from "../../claim/lib/claim-lib.mjs";
import { STATUS } from "../project-status/project-status-lib.mjs";

export { REPORT_LABEL, TRIAGE_LABEL };

const EPIC_PREFIX = "epic:";

/**
 * The board option for `key`: the option whose name is `key` (Typ: "Story") or whose first word is `key` (Epic and
 * Priority: "ACC · …", "P1 high"). Matching by code keeps the German option texts of the board out of the repository.
 */
export function findOption(options = [], key) {
  return options.find((o) => o.name === key || o.name.split(" ")[0] === key);
}

const norm = (value) => String(value ?? "").trim();

/** Type entry of the taxonomy for a label (case-insensitive), or undefined. */
export function typeEntryOf(taxonomy, label) {
  const wanted = norm(label).toLowerCase();
  return taxonomy.types.find((t) => t.label === wanted);
}

/** Epic entry of the taxonomy for a code (case-insensitive), or undefined. */
export function epicEntryOf(taxonomy, code) {
  const wanted = norm(code).toUpperCase();
  return taxonomy.epics.find((e) => e.code === wanted);
}

/**
 * The board values that follow from a type label and an epic code: { Typ, Epic }, or null when one is unknown. Epic is
 * the code, or the entry's `option` when the board option does not start with the code (E: "Entscheidungen").
 */
export function boardFieldsFor(taxonomy, type, epic) {
  const t = typeEntryOf(taxonomy, type);
  const e = epicEntryOf(taxonomy, epic);
  return t && e ? { Typ: t.typ, Epic: e.option ?? e.code } : null;
}

/**
 * Verdict on the labels of one issue. An issue is valid with exactly one type label and exactly one epic label, both
 * from the taxonomy. `missing` names the kinds ("type", "epic") without a label, `unknown` lists epic labels outside
 * the list (epic:MIG is retired), `multiple` lists labels of a kind that occur more than once. Other labels do not count.
 */
export function validateLabels(names, taxonomy) {
  const types = taxonomy.types.filter((t) => names.includes(t.label));
  const epicNames = names.filter((n) => n.startsWith(EPIC_PREFIX));
  const epics = taxonomy.epics.filter((e) => names.includes(e.label));
  const unknown = epicNames.filter((n) => !taxonomy.epics.some((e) => e.label === n));
  const missing = [];
  if (types.length === 0) missing.push("type");
  if (epics.length === 0) missing.push("epic");
  const multiple = [
    ...(types.length > 1 ? types.map((t) => t.label) : []),
    ...(epics.length > 1 ? epics.map((e) => e.label) : []),
  ];
  const ok = missing.length === 0 && unknown.length === 0 && multiple.length === 0;
  const typeLabel = types.length === 1 ? types[0].label : null;
  const epicCode = epics.length === 1 ? epics[0].code : null;
  return {
    ok,
    missing,
    unknown,
    multiple,
    typeLabel,
    epicCode,
    fields: ok ? boardFieldsFor(taxonomy, typeLabel, epicCode) : null,
  };
}

/**
 * Whether to post the comment. An invalid issue gets one comment when it becomes invalid and again when its labels
 * change; a plain edit of an issue that is already flagged stays quiet (no comment per edit).
 */
export function shouldComment({ verdict, flagged, event = "" }) {
  return !verdict.ok && (!flagged || event === "labeled" || event === "unlabeled");
}

/** The comment for an invalid issue: what is missing or unknown, the allowed labels, and how to resolve it. */
export function commentBody(verdict, taxonomy) {
  const lines = [
    `This issue needs exactly one type label and exactly one epic label before it is worked on (FR-DEV-10).`,
    "",
  ];
  if (verdict.missing.includes("type"))
    lines.push(
      `- Missing: a type label, one of ${taxonomy.types.map((t) => `\`${t.label}\``).join(", ")}.`,
    );
  if (verdict.missing.includes("epic"))
    lines.push(
      `- Missing: an epic label, one of ${taxonomy.epics.map((e) => `\`${e.label}\``).join(", ")}.`,
    );
  for (const label of verdict.unknown)
    lines.push(`- Not allowed: \`${label}\` is not in the list of epic labels.`);
  if (verdict.multiple.length)
    lines.push(
      `- Too many: ${verdict.multiple.map((l) => `\`${l}\``).join(", ")}. Keep exactly one of each kind.`,
    );
  lines.push(
    "",
    `The label \`${TRIAGE_LABEL}\` stays on the issue until the labels are right; then it is removed and the board fields Typ and Epic follow the labels. Add the missing label, or remove the wrong one. A new type or epic label needs an owner-approved pull request to \`app/config/project/issue-taxonomy.json\`.`,
  );
  return lines.join("\n");
}

/**
 * Checks the input of `make issue` before anything is created. Returns { ok, errors }; with ok, the labels to set,
 * the board fields (a new item starts with Status Todo, FR-DEV-10 (e)) and the normalised title and body.
 */
export function validateNewIssue({ type, epic, priority, title, body }, taxonomy) {
  const errors = [];
  const t = typeEntryOf(taxonomy, type);
  const e = epicEntryOf(taxonomy, epic);
  const p = taxonomy.priorities.includes(norm(priority).toUpperCase())
    ? norm(priority).toUpperCase()
    : null;
  if (!t)
    errors.push(
      `unknown type "${norm(type)}"; allowed: ${taxonomy.types.map((x) => x.label).join(", ")}`,
    );
  if (!e)
    errors.push(
      `unknown epic "${norm(epic)}"; allowed: ${taxonomy.epics.map((x) => x.code).join(", ")}`,
    );
  if (!p)
    errors.push(`unknown priority "${norm(priority)}"; allowed: ${taxonomy.priorities.join(", ")}`);
  const cleanTitle = norm(title);
  if (!cleanTitle) errors.push("missing title");
  else if (/[\r\n]/.test(cleanTitle)) errors.push("the title must be one line");
  if (!norm(body)) errors.push("the body file is empty");
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    errors,
    type: t.label,
    epic: e.code,
    title: cleanTitle,
    body: String(body),
    labels: [t.label, e.label],
    fields: { Typ: t.typ, Epic: e.code, Priority: p, Status: STATUS.todo },
  };
}

/** Issue URL on GitHub from the repository (owner/name) and the number. */
export const issueUrl = (repo, number) => `https://github.com/${repo}/issues/${number}`;

/** Issue number from the URL that `gh issue create` prints; throws when there is none. */
export function issueNumberOf(url) {
  const m = /\/issues\/(\d+)\s*$/.exec(norm(url));
  if (!m) throw new Error(`no issue number in "${norm(url)}"`);
  return Number(m[1]);
}
