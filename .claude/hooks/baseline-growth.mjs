// Baseline growth (US-QG-07, FR-QG-17). A baseline in app/config/gates/baselines/ may shrink without a human; a change
// that grows it needs one. Pure functions, no I/O: the Claude Code hook (run.mjs) and `make merge`
// (app/tools/workflow/merge-pr.mjs) read the files and call them. Tested in baseline-growth.test.mjs.
//
// Growth of one file: a limit (maxEntries, maxTotal) raised or removed; an entry that did not exist before; a judged
// value of a known entry that got higher (a higher count or limit lets more violations through); a new file.
// Shrinking is the opposite. Text that does not parse, a format this module does not know, a duplicate entry, an
// unknown field and a deletion whose gate still names the file all count as growth (fail closed). A changed `date`
// is metadata and does not count.

export const BASELINE_DIR = "app/config/gates/baselines/";

/** Every file in the folder is guarded, also one of a format this module does not know (fail closed). */
export const isBaselineFile = (relativePath) => relativePath.startsWith(BASELINE_DIR);

const TEXT = "text";
const NUMBER = "number";

/**
 * The formats, one per file, as the checkers read them:
 * - `limits`: numbers that bound the whole file (maxEntries, maxTotal); a missing limit is no limit.
 * - `entries.key`: the fields that identify an entry. `fields` are required; `optional` numbers have a default, the
 *   value the checker uses for a missing count (`e[k] ?? 0`, `e.pageX ?? 1`). `judged` numbers are compared: higher is worse.
 * - `lists`: named lists of unique texts (reference): a new text is growth.
 * - `nested`: { rule: { directory: value } } (layout): the value per rule and directory is judged.
 */
export const BASELINE_FORMATS = {
  "a11y-routes-baseline.json": {
    limits: ["maxEntries"],
    entries: {
      key: ["screen", "size", "kind", "rule"],
      fields: { screen: TEXT, size: TEXT, kind: TEXT, rule: TEXT, count: NUMBER },
      judged: ["count"],
    },
  },
  "one-screen-baseline.json": {
    limits: ["maxEntries"],
    entries: {
      key: ["screen", "size"],
      fields: { screen: TEXT, size: TEXT, page: NUMBER, inner: NUMBER },
      optional: { pageX: 1, innerX: 1, cap: 0 },
      judged: ["page", "inner", "pageX", "innerX", "cap"],
    },
  },
  "page-snapshots-baseline.json": {
    limits: ["maxEntries"],
    entries: { key: ["file"], fields: { file: TEXT }, judged: [] },
  },
  "quality-baseline.json": {
    limits: ["maxEntries"],
    entries: {
      key: ["rule", "file", "function"],
      fields: { rule: TEXT, file: TEXT, function: TEXT, value: NUMBER, date: TEXT },
      judged: ["value"],
    },
  },
  "quality-ds-baseline.json": {
    limits: [],
    entries: { key: ["rule", "file"], fields: { rule: TEXT, file: TEXT, count: NUMBER }, judged: ["count"] },
  },
  "constants-baseline.json": {
    limits: ["maxTotal"],
    entries: { key: ["file"], fields: { file: TEXT }, optional: { numbers: 0, enums: 0 }, judged: ["numbers", "enums"] },
  },
  "ui-text-baseline.json": {
    limits: ["maxTotal"],
    entries: { key: ["file"], fields: { file: TEXT, count: NUMBER }, judged: ["count"] },
  },
  "reference-baseline.json": { lists: ["routes", "operations", "components"] },
  "layout-baseline.json": { nested: true },
};

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isText = (value) => typeof value === "string";
const isCount = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
const CHECK = { [TEXT]: isText, [NUMBER]: isCount };

/** Throws when an object has a field that the format does not know. */
function onlyKeys(object, allowed) {
  for (const key of Object.keys(object))
    if (!allowed.includes(key)) throw new Error(`the file has the field ${key}, which the format does not know`);
}

function parseObject(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("it is not JSON");
  }
  if (!isObject(value)) throw new Error("the top level is not an object");
  return value;
}

/** The entries of a file: one row per key, with the judged values (defaults applied). */
function rowsOf(list, spec) {
  if (!Array.isArray(list)) throw new Error("entries is not a list");
  const optional = spec.optional ?? {};
  const rows = new Map();
  for (const entry of list) {
    if (!isObject(entry)) throw new Error("an entry is not an object");
    onlyKeys(entry, [...Object.keys(spec.fields), ...Object.keys(optional)]);
    for (const [name, type] of Object.entries(spec.fields))
      if (!CHECK[type](entry[name])) throw new Error(`entry field ${name} is missing or not a ${type}`);
    for (const name of Object.keys(optional))
      if (entry[name] !== undefined && !isCount(entry[name])) throw new Error(`entry field ${name} is not a number`);
    const label = spec.key.map((name) => entry[name]).join(" ");
    const key = JSON.stringify(spec.key.map((name) => entry[name]));
    if (rows.has(key)) throw new Error(`duplicate entry ${label}`);
    rows.set(key, {
      label,
      values: Object.fromEntries(spec.judged.map((name) => [name, entry[name] ?? optional[name]])),
    });
  }
  return rows;
}

function listsOf(root, names) {
  onlyKeys(root, names);
  const rows = new Map();
  for (const name of names) {
    const list = root[name] ?? [];
    if (!Array.isArray(list) || !list.every(isText)) throw new Error(`${name} is not a list of texts`);
    for (const item of list) {
      const key = JSON.stringify([name, item]);
      if (rows.has(key)) throw new Error(`duplicate ${name} entry ${item}`);
      rows.set(key, { label: `${name} ${item}`, values: {} });
    }
  }
  return { limits: new Map(), rows };
}

function nestedOf(root) {
  const rows = new Map();
  for (const [rule, directories] of Object.entries(root)) {
    if (!/^LY-\d+$/.test(rule) || !isObject(directories)) throw new Error(`${rule} is not a layout rule with directories`);
    for (const [directory, value] of Object.entries(directories)) {
      if (!isCount(value)) throw new Error(`${rule} ${directory} is not a number`);
      rows.set(JSON.stringify([rule, directory]), { label: `${rule} ${directory}`, values: { value } });
    }
  }
  return { limits: new Map(), rows };
}

/** The comparable model of one file text: its limits and its rows. Throws when the text does not fit the format. */
function modelOf(format, text) {
  const root = parseObject(text);
  if (format.nested) return nestedOf(root);
  if (format.lists) return listsOf(root, format.lists);
  onlyKeys(root, [...format.limits, "entries"]);
  const limits = new Map(
    format.limits.map((name) => {
      if (!isCount(root[name])) throw new Error(`${name} is missing or not a number`);
      return [name, root[name]];
    }),
  );
  return { limits, rows: rowsOf(root.entries, format.entries) };
}

const show = (limit) => (limit === Infinity ? "no limit" : String(limit));

/**
 * Whether a baseline file grows when it goes from `before` to `after`. Both are texts; null means the file does not
 * exist. `gateNamesFile`: a deleted file shrinks only when its gate no longer names it (default: it still does).
 * Returns { grows, reasons }; the reasons name what grew.
 */
export function baselineGrows(relativePath, before, after, { gateNamesFile = true } = {}) {
  const name = relativePath.split("/").pop();
  if (before === null) return { grows: true, reasons: ["a new baseline file"] };
  if (after === null)
    return gateNamesFile
      ? { grows: true, reasons: ["deleted while its gate still names it"] }
      : { grows: false, reasons: [] };
  if (!Object.hasOwn(BASELINE_FORMATS, name))
    return { grows: true, reasons: ["a format this module does not know"] };
  const format = BASELINE_FORMATS[name];
  let was;
  let now;
  try {
    was = modelOf(format, before);
  } catch (error) {
    return { grows: true, reasons: [`the current text does not parse: ${error.message}`] };
  }
  try {
    now = modelOf(format, after);
  } catch (error) {
    return { grows: true, reasons: [`the new text does not parse: ${error.message}`] };
  }
  const reasons = [];
  for (const limit of new Set([...was.limits.keys(), ...now.limits.keys()])) {
    const old = was.limits.get(limit) ?? Infinity;
    const next = now.limits.get(limit) ?? Infinity;
    if (next > old) reasons.push(`${limit} raised from ${show(old)} to ${show(next)}`);
  }
  for (const [key, row] of now.rows) {
    const old = was.rows.get(key);
    if (!old) {
      reasons.push(`new entry ${row.label}`);
      continue;
    }
    for (const [judged, value] of Object.entries(row.values))
      if (value > old.values[judged])
        reasons.push(`${row.label}: ${judged} rose from ${old.values[judged]} to ${value}`);
  }
  return { grows: reasons.length > 0, reasons };
}

/**
 * The text a Write, Edit or MultiEdit leaves in the file, or null when the tool would not apply it exactly (the caller
 * then asks a human). `before` is the file now; null when it does not exist.
 */
export function textAfter(toolInput, before) {
  if (typeof toolInput.content === "string") return toolInput.content;
  if (typeof before !== "string") return null;
  const edits = Array.isArray(toolInput.edits) ? toolInput.edits : [toolInput];
  let text = before;
  for (const edit of edits) {
    const oldText = edit?.old_string;
    const newText = edit?.new_string;
    if (typeof oldText !== "string" || typeof newText !== "string" || oldText === "") return null;
    const occurrences = text.split(oldText).length - 1;
    if (occurrences === 0 || (occurrences > 1 && edit.replace_all !== true)) return null;
    text = text.split(oldText).join(newText);
  }
  return text;
}

/**
 * The baseline files a PR changes, each with its text at the merge base (`before`) and at the head (`after`); null
 * means the file is absent on that side. The reads are injected: `make merge` reads GitHub and the local repository,
 * the tests read fixtures. A read that fails becomes an `error`, which refuses the PR (US-QG-07).
 */
export function baselineChanges(pr, { mergeBase, readAt, namedAtHead }) {
  const files = (pr.files ?? []).map((f) => f.path).filter(isBaselineFile);
  if (files.length === 0) return [];
  let base;
  try {
    base = mergeBase();
  } catch (error) {
    return files.map((path) => ({ path, error: `the merge base is unknown: ${error.message}` }));
  }
  return files.map((path) => {
    try {
      const before = readAt(base, path);
      const after = readAt(pr.headRefOid, path);
      if (before === null && after === null) throw new Error("the file exists on neither side");
      return { path, before, after, gateNamesFile: after === null ? namedAtHead(path) : true };
    } catch (error) {
      return { path, error: error.message.split("\n")[0] };
    }
  });
}

/** Problems of the baseline files a PR changes: a file that grows, and a version that cannot be read (fail closed). */
export function baselineProblems(changes) {
  return changes.flatMap((change) => {
    if (change.error)
      return [`baseline ${change.path}: a version cannot be read (${change.error}), so growth cannot be ruled out`];
    const { grows, reasons } = baselineGrows(change.path, change.before, change.after, {
      gateNamesFile: change.gateNamesFile,
    });
    return grows ? [`baseline grows: ${change.path} (${reasons.join("; ")})`] : [];
  });
}
