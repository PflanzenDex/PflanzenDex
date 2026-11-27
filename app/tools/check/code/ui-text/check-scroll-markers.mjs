// Marker lint and ratchet for the scroll regions of the web app (FR-QG-17, DS-61, issue 2430, P-L of #2425). The runtime twin
// is the one-screen check (QG-U8, #2423), which measures rendered screens; this reads the source in seconds. Scanned: the
// non-test, non-story .ts and .tsx files of app/packages/web/src (no product file imports a story).
// A scroll region is a line with overflow-auto, overflow-scroll or their x and y forms, also behind a variant. The shared
// scroll components (SHARED_SCROLL) mark their regions. Other files count per file in
// app/config/gates/baselines/scroll-markers-baseline.json ({ maxTotal, entries: [{ file, count }] }), which only shrinks.
//   SM-1  a file outside the shared components has more region lines than its entry, or has them and no entry
//   SM-2  an entry is higher than the file's count, or the file has none left; maxTotal above the sum (it can shrink)
//   SM-3  the entries add up to more than maxTotal
//   SM-4  a region of a shared component has no data-scroll-region or data-scroll-x in its statement
//   SM-5  a region of a shared component has no overscroll-contain in its statement
//   SM-6  data-scroll-x takes a value other than table, cards, chips, tabs or row, in any scanned file
// A statement runs from a line that starts at column 0 with a letter to the next such line. It is the heuristic element
// context of SM-4 and SM-5: a marker elsewhere in the same statement satisfies them. The baseline is edited by hand: each
// message names the number to write.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isEntryPoint } from "../../shared/entry-point.mjs";

const BASELINE_FILE = "config/gates/baselines/scroll-markers-baseline.json";
const SCROLL_X_VALUES = ["table", "cards", "chips", "tabs", "row"];
// The shared scroll components (DS-61): a folder prefix with its trailing slash. The flat primitives of src/shared/ui (R3,
// issue 2509) have no folder: their prefix is the file name up to the dot (`table.` is table.tsx, `sheet.` is the sheet and
// its parts), so `table-extra.tsx` is not part of it.
const SHARED_SCROLL = [
  "packages/web/src/shared/ui/table.",
  "packages/web/src/shared/patterns/display/panels/tabs/",
  // The card row and the chip row mark their sideways regions themselves (`data-scroll-x`, issue 2421).
  "packages/web/src/shared/patterns/display/card-row/",
  "packages/web/src/shared/patterns/elements/chip-row/",
  // ScrollEntries owns the scroll region of every list (the Pager is gone since #2422; directory renamed in #2603).
  "packages/web/src/shared/patterns/responsive/entry-list/paging/scroll-entries/",
  "packages/web/src/shared/patterns/responsive/layer-sheet/layer-host/layer-pane/",
  "packages/web/src/shared/ui/sheet.",
  "packages/web/src/shared/ui/dialog.",
];
const APP_DIR = fileURLToPath(new URL("../../../../", import.meta.url));
const REGION = /(?<![\w-])overflow-(?:x-|y-)?(?:auto|scroll)(?![\w-])/;
const OVERSCROLL = /(?<![\w-])overscroll-contain(?![\w-])/;
const MARKER = /(?<![\w-])data-scroll-(?:region|x)(?![\w-])/;

export const isScanned = (file) => /\.tsx?$/.test(file) && !/\.(?:test|stories)\.tsx?$/.test(file);
export const isShared = (file) => SHARED_SCROLL.some((prefix) => file.startsWith(prefix));

// The statement that holds line `index` (0-based): from the last line that starts with a letter at or before it, to the next.
function statementOf(lines, index) {
  const starts = (i) => /^[A-Za-z]/.test(lines[i]);
  let start = index;
  while (start > 0 && !starts(start)) start -= 1;
  let end = index + 1;
  while (end < lines.length && !starts(end)) end += 1;
  return { start, text: lines.slice(start, end).join("\n") };
}

// SM-4 and SM-5: one finding per statement that holds a region line, at its first region line.
function sharedErrors(file, lines) {
  const errors = [];
  const seen = new Set();
  lines.forEach((text, index) => {
    if (!REGION.test(text)) return;
    const statement = statementOf(lines, index);
    if (seen.has(statement.start)) return;
    seen.add(statement.start);
    const where = `${file}:${index + 1}`;
    if (!MARKER.test(statement.text))
      errors.push(`SM-4 ${where}: shared region has no data-scroll-region or data-scroll-x`);
    if (!OVERSCROLL.test(statement.text))
      errors.push(`SM-5 ${where}: shared region has no overscroll-contain`);
  });
  return errors;
}

// The values of the data-scroll-x attributes of one line: a string literal (`data-scroll-x="table"`, `"data-scroll-x": …`),
// or for an expression the string literals up to its first comma; `null` where an expression has none.
export function scrollXValues(text) {
  const values = [];
  for (const match of text.matchAll(/data-scroll-x"?\s*[:=]\s*/g)) {
    const rest = text.slice(match.index + match[0].length);
    const direct = /^\{?\s*"([^"]*)"/.exec(rest);
    if (direct) values.push(direct[1]);
    else {
      const literals = [...rest.split(",")[0].matchAll(/"([^"]*)"/g)].map((m) => m[1]);
      values.push(...(literals.length > 0 ? literals : [null]));
    }
  }
  return values;
}

// SM-6: a value outside SCROLL_X_VALUES, or none, in any scanned file.
function valueErrors(file, lines) {
  const errors = [];
  lines.forEach((text, index) => {
    for (const value of scrollXValues(text)) {
      if (value !== null && SCROLL_X_VALUES.includes(value)) continue;
      const shown = value === null ? "no string literal" : `"${value}"`;
      const values = SCROLL_X_VALUES.join(", ");
      errors.push(
        `SM-6 ${file}:${index + 1}: data-scroll-x takes ${shown}, the values are ${values}`,
      );
    }
  });
  return errors;
}

// Pure scan: `files` maps a file (relative to app/) to its source. Returns the region counts of the files outside the shared
// components (for the baseline) and the findings of SM-4, SM-5 and SM-6.
export function scanSources(files) {
  const counts = new Map();
  const errors = [];
  for (const [file, source] of files) {
    const lines = source.split("\n");
    if (isShared(file)) errors.push(...sharedErrors(file, lines));
    else {
      const count = lines.filter((line) => REGION.test(line)).length;
      if (count > 0) counts.set(file, count);
    }
    errors.push(...valueErrors(file, lines));
  }
  return { counts, errors };
}

// Pure comparison of the counts with the baseline (SM-1 to SM-3).
export function baselineErrors(counts, baseline) {
  const known = new Map(baseline.entries.map((e) => [e.file, e.count]));
  const errors = [];
  for (const [file, count] of counts) {
    const allowed = known.get(file) ?? 0;
    if (count > allowed)
      errors.push(
        `SM-1 ${file}: ${count} scroll region line(s), the baseline allows ${allowed} (DS-61)`,
      );
    else if (count < allowed)
      errors.push(
        `SM-2 ${file}: ${count} scroll region line(s), baseline can shrink, lower it from ${allowed}`,
      );
  }
  const stale = baseline.entries.filter((e) => !counts.has(e.file));
  errors.push(
    ...stale.map(
      (e) => `SM-2 ${e.file}: no scroll region line left, baseline can shrink, remove the entry`,
    ),
  );
  const total = baseline.entries.map((e) => e.count).reduce((a, b) => a + b, 0);
  if (total > baseline.maxTotal)
    errors.push(
      `SM-3 the entries count ${total} scroll region lines, maxTotal is ${baseline.maxTotal}`,
    );
  else if (total < baseline.maxTotal)
    errors.push(
      `SM-2 maxTotal is ${baseline.maxTotal}, the entries add up to ${total}: baseline can shrink, lower maxTotal`,
    );
  return errors;
}

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

function readSources() {
  const files = new Map();
  for (const full of walk(path.join(APP_DIR, "packages/web/src"))) {
    const file = path.relative(APP_DIR, full).split(path.sep).join("/");
    if (isScanned(file)) files.set(file, fs.readFileSync(full, "utf8"));
  }
  return files;
}

if (isEntryPoint(import.meta.url)) {
  const { counts, errors } = scanSources(readSources());
  const baseline = JSON.parse(fs.readFileSync(path.join(APP_DIR, BASELINE_FILE), "utf8"));
  const all = [...errors, ...baselineErrors(counts, baseline)];
  if (all.length > 0) {
    console.error(all.join("\n"));
    console.error(
      "Scroll markers check failed (FR-QG-17, DS-61). Mark the region in a shared component; never raise the baseline to pass.",
    );
    process.exit(1);
  }
  console.log(
    `scroll-markers: ${baseline.maxTotal} known scroll region line(s) in ${baseline.entries.length} file(s), ${SHARED_SCROLL.length} shared component folder(s) checked.`,
  );
}
