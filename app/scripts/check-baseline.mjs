// Ratchet gate for code metric violations (FR-QG-17, US-QG-08).
// quality-baseline.json lists known violations: { rule, file, function, value, date }.
// This check fails when
//   BL-1  a violation exists that is not in the baseline (new or worse),
//   BL-2  a baseline entry is no longer needed or its value changed (fix: delete or lower the entry),
//   BL-3  the list grew beyond `maxEntries` (lower `maxEntries` when entries are removed; never raise it).
// ESLint runs with QUALITY_BASELINE=off so the baseline allowance in eslint.config.js does not hide anything.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const METRIC_RULES = [
  "complexity",
  "sonarjs/cognitive-complexity",
  "max-lines-per-function",
  "max-depth",
  "max-params",
];

// Turn an ESLint message of a metric rule into { function, value }; undefined for other messages.
export function parseFinding(ruleId, message, line) {
  const name = message.match(/'([^']+)'/)?.[1] ?? `@line ${line}`;
  const value =
    ruleId === "sonarjs/cognitive-complexity"
      ? message.match(/from (\d+) to/)?.[1]
      : message
          .match(/\((\d+)\)|complexity of (\d+)|depth of (\d+)/)
          ?.slice(1)
          .find(Boolean);
  return value === undefined ? undefined : { function: name, value: Number(value) };
}

const key = (f) => `${f.rule} ${f.file} ${f.function}`;

// Pure comparison: findings are the current violations, baseline the parsed JSON file.
export function checkBaseline(findings, baseline) {
  const errors = [];
  const known = new Map(baseline.entries.map((e) => [key(e), e]));
  const seen = new Set();
  for (const f of findings) {
    seen.add(key(f));
    const e = known.get(key(f));
    if (!e)
      errors.push(`BL-1 ${f.file} ${f.function}: ${f.rule} = ${f.value} is not in the baseline`);
    else if (e.value !== f.value)
      errors.push(
        `BL-${f.value > e.value ? 1 : 2} ${f.file} ${f.function}: ${f.rule} is ${f.value}, baseline says ${e.value}`,
      );
  }
  for (const e of baseline.entries)
    if (!seen.has(key(e)))
      errors.push(`BL-2 ${e.file} ${e.function}: ${e.rule} no longer violates, remove the entry`);
  if (baseline.entries.length > baseline.maxEntries)
    errors.push(
      `BL-3 baseline has ${baseline.entries.length} entries, maxEntries is ${baseline.maxEntries}`,
    );
  return errors;
}

async function currentFindings() {
  process.env.QUALITY_BASELINE = "off";
  const { ESLint } = await import("eslint");
  const results = await new ESLint().lintFiles(["."]);
  return results.flatMap((r) =>
    r.messages.flatMap((m) => {
      if (!METRIC_RULES.includes(m.ruleId)) return [];
      const p = parseFinding(m.ruleId, m.message, m.line);
      const file = path.relative(process.cwd(), r.filePath).split(path.sep).join("/");
      return p ? [{ rule: m.ruleId, file, ...p }] : [];
    }),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const baseline = JSON.parse(fs.readFileSync("quality-baseline.json", "utf8"));
  const errors = checkBaseline(await currentFindings(), baseline);
  if (errors.length) {
    console.error(errors.join("\n"));
    console.error(
      "Baseline check failed (FR-QG-17). Fix the code, never raise the baseline to pass.",
    );
    process.exit(1);
  }
  console.log(`Baseline ok: ${baseline.entries.length} known violation(s).`);
}
