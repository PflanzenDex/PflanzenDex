// Ratchet gate for the UI rules in DESIGN-SYSTEM.md (rule IDs DS-nn).
// quality-ds-baseline.json lists known violations: { rule, file, count }.
// This check fails when
//   DSB-1  a violation exists that is not in the baseline, or its count grew (new code must comply),
//   DSB-2  a baseline entry is stale or its count is higher than reality (fix: delete or lower the entry).
// `--write-baseline` creates the file when it does not exist; it never raises or adds entries afterwards.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { importViolations, RULES } from "./check-design-system-rules.mjs";

const WEB = "packages/web";
export const REQUIRED_DEPENDENCIES = [
  "tailwindcss",
  "class-variance-authority",
  "clsx",
  "tailwind-merge",
  "react-hook-form",
  "zod",
];
export const REQUIRED_FILES = ["src/components/ui", "src/lib/utils.ts"];

function* walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

const languageOf = (file) => (file.endsWith(".css") ? "css" : file.endsWith(".tsx") ? "tsx" : null);
const isTest = (file) => /\.test\.[tj]sx?$/.test(file);

// Count violations per "rule|file" in one web package root; returns Map<string, number>.
export function scan(webRoot) {
  const counts = new Map();
  const add = (rule, file) =>
    counts.set(`${rule}|${file}`, (counts.get(`${rule}|${file}`) ?? 0) + 1);
  const src = path.join(webRoot, "src");
  for (const full of walk(src)) {
    const language = languageOf(full);
    if (!language || isTest(full)) continue;
    const file = path.relative(src, full).split(path.sep).join("/");
    const lines = fs.readFileSync(full, "utf8").split("\n");
    for (const line of lines) {
      const stripped = line.replace(/\/\*.*?\*\//g, "").replace(/\/\/.*$/, "");
      for (const rule of RULES) {
        if (rule.languages.includes(language) && rule.test(stripped, file)) add(rule.id, file);
      }
      if (language === "tsx") for (const id of importViolations(file, stripped)) add(id, file);
    }
  }
  // DS-57: the web package must actually use the design system stack.
  const pkgPath = path.join(webRoot, "package.json");
  const pkg = fs.existsSync(pkgPath) ? JSON.parse(fs.readFileSync(pkgPath, "utf8")) : {};
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const name of REQUIRED_DEPENDENCIES) if (!(name in deps)) add("DS-57", `dependency:${name}`);
  for (const rel of REQUIRED_FILES)
    if (!fs.existsSync(path.join(webRoot, rel))) add("DS-57", `missing:${rel}`);
  return counts;
}

const keyOf = (e) => `${e.rule}|${e.file}`;

// Compare reality with the baseline; returns a list of problem strings (empty = pass).
export function compare(counts, entries) {
  const problems = [];
  const baseline = new Map(entries.map((e) => [keyOf(e), e.count]));
  for (const [key, count] of counts) {
    const allowed = baseline.get(key);
    const [rule, file] = key.split("|");
    if (allowed === undefined)
      problems.push(`DSB-1 ${rule} ${file}: ${count} new violation(s), not in baseline`);
    else if (count > allowed)
      problems.push(`DSB-1 ${rule} ${file}: ${count} violations, baseline allows ${allowed}`);
  }
  for (const [key, allowed] of baseline) {
    const count = counts.get(key) ?? 0;
    const [rule, file] = key.split("|");
    if (count === 0) problems.push(`DSB-2 ${rule} ${file}: fixed, delete the baseline entry`);
    else if (count < allowed)
      problems.push(`DSB-2 ${rule} ${file}: now ${count}, lower the baseline from ${allowed}`);
  }
  return problems;
}

export function toEntries(counts) {
  return [...counts]
    .map(([key, count]) => {
      const [rule, file] = key.split("|");
      return { rule, file, count };
    })
    .sort(
      (a, b) =>
        a.rule.localeCompare(b.rule, "en", { numeric: true }) || a.file.localeCompare(b.file),
    );
}

function main() {
  const appRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
  const baselinePath = path.join(appRoot, "quality-ds-baseline.json");
  const counts = scan(path.join(appRoot, WEB));
  if (process.argv.includes("--write-baseline")) {
    if (fs.existsSync(baselinePath)) {
      console.error("quality-ds-baseline.json exists; it may only shrink, edit it by hand.");
      process.exit(1);
    }
    fs.writeFileSync(baselinePath, `${JSON.stringify({ entries: toEntries(counts) }, null, 2)}\n`);
    console.log(`wrote ${baselinePath} (${counts.size} entries)`);
    return;
  }
  const entries = JSON.parse(fs.readFileSync(baselinePath, "utf8")).entries;
  const problems = compare(counts, entries);
  if (problems.length > 0) {
    console.error("Design system check failed (DESIGN-SYSTEM.md, section 6):");
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log(`Design system check passed (${entries.length} known violations in the baseline).`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
