// Ratchet for literal UI texts (FR-QG-26, QG-C8; FR-QG-17 applied to the message tables).
// ui-text-baseline.json counts the known literals per file: { maxTotal, entries: [{ file, count }] }.
// ESLint (rule ui-text/no-literal-text, eslint.config.js) already fails on a literal in a file that is not listed and
// on a listed file that went over its count. This check runs the rule with UI_TEXT_BASELINE=off and fails when
//   UT-1  a file has more literals than its entry says, or has literals and no entry,
//   UT-2  an entry is higher than the file's count or the file has none left (lower or remove the entry),
//   UT-3  the counts add up to more than `maxTotal` (lower `maxTotal` when texts move into a table; never raise it).
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { lintFindings } from "../../quality/gates/eslint-shared.mjs";

export const RULE = "ui-text/no-literal-text";
export const BASELINE_FILE = "config/gates/baselines/ui-text-baseline.json";
const SOURCES = ["packages/web/src"];

// Pure comparison: `counts` maps a file (relative to app/) to its number of literal UI texts.
export function checkUiText(counts, baseline) {
  const errors = [];
  const known = new Map(baseline.entries.map((e) => [e.file, e.count]));
  for (const [file, count] of counts) {
    const allowed = known.get(file) ?? 0;
    if (count > allowed)
      errors.push(`UT-1 ${file}: ${count} literal UI text(s), the baseline allows ${allowed}`);
    else if (count < allowed)
      errors.push(`UT-2 ${file}: ${count} literal UI text(s), lower the entry from ${allowed}`);
  }
  for (const e of baseline.entries)
    if (!counts.has(e.file))
      errors.push(`UT-2 ${e.file}: no literal UI text left, remove the entry`);
  const total = baseline.entries.reduce((sum, e) => sum + e.count, 0);
  if (total > baseline.maxTotal)
    errors.push(
      `UT-3 the baseline counts ${total} literal UI texts, maxTotal is ${baseline.maxTotal}`,
    );
  return errors;
}

// The current baseline as it would be written: every file with literals, sorted, maxTotal = the sum.
export function toBaseline(counts) {
  const entries = [...counts]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([file, count]) => ({ file, count }));
  return { maxTotal: entries.reduce((sum, e) => sum + e.count, 0), entries };
}

async function currentCounts() {
  const counts = new Map();
  for (const { file, messages } of await lintFindings({ dirs: SOURCES, rules: [RULE] })) {
    const n = messages.filter((m) => m.ruleId === RULE).length;
    if (n) counts.set(file, n);
  }
  return counts;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const counts = await currentCounts();
  if (process.argv.includes("--write")) {
    fs.writeFileSync(BASELINE_FILE, `${JSON.stringify(toBaseline(counts), null, 2)}\n`);
    console.log(`ui-text: wrote ${counts.size} file(s) to ${BASELINE_FILE}`);
    process.exit(0);
  }
  const baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8"));
  const errors = checkUiText(counts, baseline);
  if (errors.length) {
    console.error(errors.join("\n"));
    console.error(
      "UI text check failed (FR-QG-26). Move texts into the feature's *.de.json; never raise the baseline to pass.",
    );
    process.exit(1);
  }
  console.log(
    `ui-text: ${baseline.maxTotal} known literal UI text(s) in ${baseline.entries.length} file(s).`,
  );
}
