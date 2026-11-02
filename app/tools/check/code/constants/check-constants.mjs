// Ratchet for inline numbers and enum literals (FR-QG-12, QG-C9; FR-QG-17 applied to the constants).
// constants-baseline.json counts the known hits per file and rule:
//   { maxTotal, entries: [{ file, numbers?, enums? }] }   (a missing count is 0)
// ESLint (rules constants/no-magic-number and constants/no-enum-literal, eslint.config.js) already fails on a hit in
// a file that is not listed and on a listed file that went over its count. This check runs the rules with
// CONSTANTS_BASELINE=off and fails when
//   CN-1  a file has more hits than its entry says, or has hits and no entry,
//   CN-2  an entry is higher than the file's count or the file has none left (lower or remove the entry),
//   CN-3  the counts add up to more than `maxTotal` (lower `maxTotal` when hits move; never raise it).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const RULES = { numbers: "constants/no-magic-number", enums: "constants/no-enum-literal" };
export const BASELINE_FILE = "config/gates/baselines/constants-baseline.json";
const SOURCES = ["packages/core/src", "packages/api/src", "packages/web/src"];
const KINDS = Object.keys(RULES);
const sumOf = (e) => KINDS.reduce((s, k) => s + (e[k] ?? 0), 0);

// Pure comparison: `counts` maps a file (relative to app/) to { numbers, enums }.
export function checkConstants(counts, baseline) {
  const errors = [];
  const known = new Map(baseline.entries.map((e) => [e.file, e]));
  for (const [file, count] of counts) {
    for (const kind of KINDS) {
      const have = count[kind] ?? 0;
      const allowed = known.get(file)?.[kind] ?? 0;
      if (have > allowed)
        errors.push(`CN-1 ${file}: ${have} ${kind}, the baseline allows ${allowed}`);
      else if (have < allowed)
        errors.push(`CN-2 ${file}: ${have} ${kind}, lower the entry from ${allowed}`);
    }
  }
  for (const e of baseline.entries)
    if (!counts.has(e.file)) errors.push(`CN-2 ${e.file}: no hit left, remove the entry`);
  const total = baseline.entries.reduce((sum, e) => sum + sumOf(e), 0);
  if (total > baseline.maxTotal)
    errors.push(`CN-3 the baseline counts ${total} hits, maxTotal is ${baseline.maxTotal}`);
  return errors;
}

// The current baseline as it would be written: every file with hits, sorted, maxTotal = the sum.
export function toBaseline(counts) {
  const entries = [...counts]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([file, c]) => ({
      file,
      ...Object.fromEntries(KINDS.filter((k) => c[k]).map((k) => [k, c[k]])),
    }));
  return { maxTotal: entries.reduce((sum, e) => sum + sumOf(e), 0), entries };
}

async function currentCounts() {
  process.env.CONSTANTS_BASELINE = "off";
  const { ESLint } = await import("eslint");
  const ids = Object.values(RULES);
  const eslint = new ESLint({ ruleFilter: ({ ruleId }) => ids.includes(ruleId) });
  const counts = new Map();
  for (const r of await eslint.lintFiles(SOURCES)) {
    const c = {};
    for (const kind of KINDS) c[kind] = r.messages.filter((m) => m.ruleId === RULES[kind]).length;
    if (sumOf(c)) counts.set(path.relative(process.cwd(), r.filePath).split(path.sep).join("/"), c);
  }
  return counts;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const counts = await currentCounts();
  if (process.argv.includes("--write")) {
    fs.writeFileSync(BASELINE_FILE, `${JSON.stringify(toBaseline(counts), null, 2)}\n`);
    console.log(`constants: wrote ${counts.size} file(s) to ${BASELINE_FILE}`);
    process.exit(0);
  }
  const baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8"));
  const errors = checkConstants(counts, baseline);
  if (errors.length) {
    console.error(errors.join("\n"));
    console.error(
      "Constants check failed (FR-QG-12). Name the number in the module's limits and compare enum values through their constant; never raise the baseline to pass.",
    );
    process.exit(1);
  }
  console.log(
    `constants: ${baseline.maxTotal} known hit(s) in ${baseline.entries.length} file(s).`,
  );
}
