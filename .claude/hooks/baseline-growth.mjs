// Baseline growth (US-QG-07, FR-QG-17). A baseline in app/config/gates/baselines/ may shrink without a human; a change
// that grows it needs one. Pure functions, no I/O: the Claude Code hook (run.mjs) and `make merge`
// (app/tools/workflow/merge-pr.mjs) read the files and call them. Tested in baseline-growth.test.mjs.
//
// Growth of one file: a limit (maxEntries, maxTotal) raised or removed; an entry that did not exist before; a judged
// value of a known entry that got higher (a higher count or limit lets more violations through); a new file.
// Shrinking is the opposite. Text that does not parse, a format this module does not know, a duplicate entry, an
// unknown field and a deletion whose gate still names the file all count as growth (fail closed). A changed `date`
// is metadata and does not count.
//
// A layout manifest (the frontmatter of a README.md, FR-QG-21, owner decision d-136, LY-1c) is judged the same way by
// manifestGrowth: a new manifest or a raised `expect` is growth; a lowered `expect` and a removed manifest are not.
// The fixed per-path limits that d-139 (issue 2546) moved into manifests carry over: a new manifest within the limit the
// merge base gave its folder (the README unit it adds counted on top) is no growth (carriedLimit).

import vm from "node:vm";
import {
  isManifestPath,
  parseManifest,
} from "../../app/tools/check/code/layout/layout-manifest.mjs";
import { matchDir } from "../../app/tools/check/code/layout/layout-tree.mjs";

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
 * - `entries.sets`: fields of one entry that are lists of unique texts (the one-screen `rules`): a text that the
 *   entry did not have before is growth, a lost one a shrink; a missing list is an empty one.
 * - `entries.meta`: optional fields that are metadata (the `issue` and `reason` of an entry): checked for their type,
 *   never compared.
 * - `lists`: named lists of unique texts (reference): a new text is growth.
 * - `nested`: { rule: { directory: value } } (layout): the value per rule and directory is judged.
 * - `suppressions`: the ESLint bulk suppressions of `eslint --suppressions-location` (issue 2512, US-QG-01),
 *   { file: { rule: { count } } }: `count` is judged; a file or a rule that is gone is a shrink.
 */
export const BASELINE_FORMATS = {
  "a11y-routes-baseline.json": {
    limits: ["maxEntries"],
    entries: {
      key: ["screen", "size", "kind", "rule"],
      fields: {
        screen: TEXT,
        size: TEXT,
        kind: TEXT,
        rule: TEXT,
        count: NUMBER,
      },
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
      sets: ["rules"],
      meta: { issue: NUMBER, reason: TEXT },
    },
  },
  "layout-shift-baseline.json": {
    limits: ["maxEntries"],
    entries: {
      key: ["screen", "size"],
      fields: { screen: TEXT, size: TEXT, cls: NUMBER },
      judged: ["cls"],
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
      fields: {
        rule: TEXT,
        file: TEXT,
        function: TEXT,
        value: NUMBER,
        date: TEXT,
      },
      judged: ["value"],
    },
  },
  "quality-ds-baseline.json": {
    limits: [],
    entries: {
      key: ["rule", "file"],
      fields: { rule: TEXT, file: TEXT, count: NUMBER },
      judged: ["count"],
    },
  },
  "constants-baseline.json": {
    limits: ["maxTotal"],
    entries: {
      key: ["file"],
      fields: { file: TEXT },
      optional: { numbers: 0, enums: 0 },
      judged: ["numbers", "enums"],
    },
  },
  "ui-text-baseline.json": {
    limits: ["maxTotal"],
    entries: {
      key: ["file"],
      fields: { file: TEXT, count: NUMBER },
      judged: ["count"],
    },
  },
  // FR-QG-17, issue 2430: the scroll region lines outside the shared scroll components (check-scroll-markers.mjs), the same
  // shape as the UI text ratchet: a raised count or maxTotal is growth, a lowered one a shrink.
  "scroll-markers-baseline.json": {
    limits: ["maxTotal"],
    entries: {
      key: ["file"],
      fields: { file: TEXT, count: NUMBER },
      judged: ["count"],
    },
  },
  "reference-baseline.json": { lists: ["routes", "operations", "components"] },
  "layout-baseline.json": { nested: true },
  // US-QG-06: the quarantine list (`make quarantine`). An entry or a raised maxEntries is growth, a removal a shrink; `since`,
  // `issue` and `reason` are metadata. The reader (app/tools/workflow/actions/ci-reuse/verdict/quarantine.mjs) checks the jobs.
  "quarantine-baseline.json": {
    limits: ["maxEntries"],
    entries: {
      key: ["job"],
      fields: { job: TEXT, since: TEXT, issue: NUMBER, reason: TEXT },
      judged: [],
    },
  },
  // US-QG-01 (issue 2512): the ESLint bulk suppressions of the hooks rules, written by `eslint --suppressions-location`
  // (`npm run lint` and lint-staged read it). The format is in suppressionsOf.
  "hooks-baseline.json": { suppressions: true },
};

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isText = (value) => typeof value === "string";
const isCount = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
const CHECK = { [TEXT]: isText, [NUMBER]: isCount };

/** Throws when an object has a field that the format does not know. */
function onlyKeys(object, allowed) {
  for (const key of Object.keys(object))
    if (!allowed.includes(key))
      throw new Error(`the file has the field ${key}, which the format does not know`);
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
    const sets = spec.sets ?? [];
    const meta = spec.meta ?? {};
    onlyKeys(entry, [
      ...Object.keys(spec.fields),
      ...Object.keys(optional),
      ...sets,
      ...Object.keys(meta),
    ]);
    for (const name of sets)
      if (entry[name] !== undefined && (!Array.isArray(entry[name]) || !entry[name].every(isText)))
        throw new Error(`entry field ${name} is not a list of texts`);
    for (const [name, type] of Object.entries(meta))
      if (entry[name] !== undefined && !CHECK[type](entry[name]))
        throw new Error(`entry field ${name} is not a ${type}`);
    for (const [name, type] of Object.entries(spec.fields))
      if (!CHECK[type](entry[name]))
        throw new Error(`entry field ${name} is missing or not a ${type}`);
    for (const name of Object.keys(optional))
      if (entry[name] !== undefined && !isCount(entry[name]))
        throw new Error(`entry field ${name} is not a number`);
    const label = spec.key.map((name) => entry[name]).join(" ");
    const key = JSON.stringify(spec.key.map((name) => entry[name]));
    if (rows.has(key)) throw new Error(`duplicate entry ${label}`);
    rows.set(key, {
      label,
      values: Object.fromEntries(spec.judged.map((name) => [name, entry[name] ?? optional[name]])),
      sets: Object.fromEntries(sets.map((name) => [name, new Set(entry[name] ?? [])])),
    });
  }
  return rows;
}

function listsOf(root, names) {
  onlyKeys(root, names);
  const rows = new Map();
  for (const name of names) {
    const list = root[name] ?? [];
    if (!Array.isArray(list) || !list.every(isText))
      throw new Error(`${name} is not a list of texts`);
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
    if (!/^LY-\d+$/.test(rule) || !isObject(directories))
      throw new Error(`${rule} is not a layout rule with directories`);
    for (const [directory, value] of Object.entries(directories)) {
      if (!isCount(value)) throw new Error(`${rule} ${directory} is not a number`);
      rows.set(JSON.stringify([rule, directory]), {
        label: `${rule} ${directory}`,
        values: { value },
      });
    }
  }
  return { limits: new Map(), rows };
}

// ESLint bulk suppressions (issue 2512, US-QG-01): one row per file and rule, judged by its count. A new file or rule is a
// new entry (growth); a raised count grows, a lowered one or a removed file or rule shrinks. Any other field, a count that
// is no number, or a value that is no object is malformed (fail closed, like the formats above).
function suppressionsOf(root) {
  const rows = new Map();
  for (const [file, rules] of Object.entries(root)) {
    if (!isObject(rules)) throw new Error(`${file} is not an object of rules`);
    for (const [rule, suppression] of Object.entries(rules)) {
      if (!isObject(suppression)) throw new Error(`${file} ${rule} is not an object`);
      onlyKeys(suppression, ["count"]);
      if (!isCount(suppression.count)) throw new Error(`${file} ${rule} count is not a number`);
      rows.set(JSON.stringify([file, rule]), {
        label: `${file} ${rule}`,
        values: { count: suppression.count },
      });
    }
  }
  return { limits: new Map(), rows };
}

/** The comparable model of one file text: its limits and its rows. Throws when the text does not fit the format. */
function modelOf(format, text) {
  const root = parseObject(text);
  if (format.nested) return nestedOf(root);
  if (format.suppressions) return suppressionsOf(root);
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
    return {
      grows: true,
      reasons: [`the current text does not parse: ${error.message}`],
    };
  }
  try {
    now = modelOf(format, after);
  } catch (error) {
    return {
      grows: true,
      reasons: [`the new text does not parse: ${error.message}`],
    };
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
    for (const [name, items] of Object.entries(row.sets ?? {}))
      for (const item of items)
        if (!old.sets?.[name]?.has(item)) reasons.push(`${row.label}: new ${name} entry ${item}`);
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

// The layout manifest of a README.md text; null text means the file is absent (US-QG-09, d-136).
const manifestOf = (text) => (text === null ? { state: "none" } : parseManifest(text));

/**
 * Whether a layout manifest grows from `before` to `after` (texts; null when the file is absent): a new manifest and a
 * raised `expect` grow it, a lowered one, a removed manifest and a README without frontmatter do not. A manifest that
 * does not parse counts as growth (fail closed), as a baseline text that does not parse does (US-QG-09, LY-1c, LY-7).
 * `carried` is the limit the merge base gave the folder (carriedLimit, d-139): a new manifest whose expect stays within it
 * is no growth; without one (undefined) a new manifest is growth.
 */
export function manifestGrowth(before, after, carried) {
  const was = manifestOf(before);
  const now = manifestOf(after);
  if (now.state === "none") return { grows: false, reasons: [] };
  if (now.state === "bad")
    return {
      grows: true,
      reasons: [`the layout manifest does not parse: ${now.problems.join(", ")}`],
    };
  if (was.state !== "ok") {
    if (carried !== undefined && now.expect <= carried) return { grows: false, reasons: [] };
    return { grows: true, reasons: [`a new manifest, expect ${now.expect}`] };
  }
  if (now.expect > was.expect)
    return { grows: true, reasons: [`expect rose from ${was.expect} to ${now.expect}`] };
  return { grows: false, reasons: [] };
}

// The layout config (FR-QG-21): its per-path rules are the limits a folder had at the merge base (d-139).
export const LAYOUT_CONFIG = "app/config/lint/layout.config.mjs";

// The config read as data: its default export runs in an empty context (no imports, no I/O); a text that does not run throws.
function layoutConfigOf(text) {
  const sandbox = { module: { exports: {} } };
  vm.runInNewContext(text.replace(/^export default /m, "module.exports = "), sandbox, {
    timeout: 1000,
  });
  return sandbox.module.exports;
}

/**
 * The units a folder may carry over from the per-path rule of the merge base into its manifest (d-139): the rule's
 * maxUnits, plus the README unit when the README is new at the merge base (`readmeAtBase` null), because the manifest adds
 * that unit. Undefined when no finite per-path rule matches the folder, or the config text is missing or does not run (fail
 * closed: a manifest then counts as growth).
 */
export function carriedLimit(configText, dir, readmeAtBase) {
  if (typeof configText !== "string") return undefined;
  let rule;
  try {
    rule = layoutConfigOf(configText).dirs?.find((r) => matchDir(r.path, dir));
  } catch {
    return undefined;
  }
  if (!Number.isFinite(rule?.maxUnits)) return undefined;
  return rule.maxUnits + (readmeAtBase === null ? 1 : 0);
}

/**
 * The reason a layout manifest edit grows the manifest, or null. `before` is the file on disk (null when absent); the edit
 * is placed on it (textAfter) and judged by manifestGrowth. `base` holds the layout config and the README at the merge base,
 * so the carried limit (d-139) is judged there: a README made on this branch still counts its unit as new. An edit that
 * cannot be placed exactly grows the manifest (fail closed).
 */
export function manifestEditGrowth(file, before, toolInput, base) {
  const after = textAfter(toolInput, before);
  if (after === null) return "the edit cannot be placed exactly on the file";
  const dir = file.split("/").slice(0, -1).join("/");
  const { grows, reasons } = manifestGrowth(
    before,
    after,
    carriedLimit(base.config, dir, base.readme),
  );
  return grows ? reasons.join("; ") : null;
}

/**
 * The baseline files and the layout manifests (README.md frontmatter) a PR changes, each with its text at the merge base
 * (`before`) and at the head (`after`); null means the file is absent on that side. The reads are injected: `make merge`
 * reads GitHub and the local repository, the tests read fixtures. A read that fails becomes an `error`, which refuses the
 * PR (US-QG-07, US-QG-09).
 */
export function baselineChanges(pr, { mergeBase, readAt, namedAtHead }) {
  const guarded = (path) => isBaselineFile(path) || isManifestPath(path);
  const files = (pr.files ?? []).map((f) => f.path).filter(guarded);
  if (files.length === 0) return [];
  let base;
  try {
    base = mergeBase();
  } catch (error) {
    return files.map((path) => ({
      path,
      error: `the merge base is unknown: ${error.message}`,
    }));
  }
  // The layout config of the merge base, read once and only when a manifest changes (d-139): its per-path limits carry over.
  let layoutAtBase;
  const layoutConfigAtBase = () => {
    if (layoutAtBase === undefined) layoutAtBase = readAt(base, LAYOUT_CONFIG);
    return layoutAtBase;
  };
  return files.map((path) => {
    try {
      const before = readAt(base, path);
      const after = readAt(pr.headRefOid, path);
      if (before === null && after === null) throw new Error("the file exists on neither side");
      const change = {
        path,
        before,
        after,
        gateNamesFile: after === null && isBaselineFile(path) ? namedAtHead(path) : true,
      };
      if (isManifestPath(path))
        change.carried = carriedLimit(
          layoutConfigAtBase(),
          path.split("/").slice(0, -1).join("/"),
          before,
        );
      return change;
    } catch (error) {
      return { path, error: error.message.split("\n")[0] };
    }
  });
}

/**
 * Problems of the baseline files and the layout manifests a PR changes: a file that grows, and a version that cannot be
 * read (fail closed). A new manifest or a raised expect is reported as baseline growth, so make merge needs the owner.
 */
export function baselineProblems(changes) {
  return changes.flatMap((change) => {
    if (change.error)
      return [
        `baseline ${change.path}: a version cannot be read (${change.error}), so growth cannot be ruled out`,
      ];
    const { grows, reasons } = isManifestPath(change.path)
      ? manifestGrowth(change.before, change.after, change.carried)
      : baselineGrows(change.path, change.before, change.after, {
          gateNamesFile: change.gateNamesFile,
        });
    return grows ? [`baseline grows: ${change.path} (${reasons.join("; ")})`] : [];
  });
}
