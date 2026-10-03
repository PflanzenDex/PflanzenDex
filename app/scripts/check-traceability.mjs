// Spec traceability and consistency (US-QG-04, FR-QG-03, FR-QG-06).
// Errors: done stories without a test, README counters that differ from the specs.
// Hints (stdout only): tests naming unknown or not-yet-done stories, unresolved references.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const STORY = /^###\s+(US-([A-Z]+)-\d+)\s+·.*·\s*(⬜|🟨|✅)/u;
const DEF = /^(?:#{2,4}\s+|\|\s*\*{0,2})((?:US|FR|DM)-[A-Z]+-\d+|E-\d+)\b/;
const REF = /\b(?:(?:US|FR|DM)-[A-Z]+-\d+|E-\d+)\b/g;
const TEST_CALL = /\b(?:describe|it|test)(?:\.(?:only|skip|todo))?\(\s*(["'`])/g;

// Text of the string literal that starts right after the opening quote at `start`.
function literalFrom(text, start, quote) {
  let end = start;
  while (end < text.length && text[end] !== quote) end += text[end] === "\\" ? 2 : 1;
  return text.slice(start, end);
}

export function parseStories(files) {
  const stories = [];
  for (const [file, text] of Object.entries(files))
    for (const line of text.split("\n")) {
      const m = line.match(STORY);
      if (m) stories.push({ id: m[1], epic: m[2], status: m[3], file: path.basename(file) });
    }
  return stories;
}

export function testedIds(testFiles) {
  const ids = new Set();
  for (const text of Object.values(testFiles))
    for (const m of text.matchAll(TEST_CALL))
      for (const id of literalFrom(text, m.index + m[0].length, m[1]).matchAll(
        /\bUS-[A-Z]+-\d+\b/g,
      ))
        ids.add(id[0]);
  return ids;
}

export function traceability(stories, tested) {
  const errors = [];
  const hints = [];
  const byId = new Map(stories.map((s) => [s.id, s]));
  for (const s of stories)
    if (s.status === "✅" && !tested.has(s.id))
      errors.push(`story ${s.id} is done (✅) in ${s.file} but no test title contains its ID`);
  for (const id of [...tested].sort()) {
    const s = byId.get(id);
    if (!s) hints.push(`test names unknown story ${id}`);
    else if (s.status === "⬜")
      hints.push(`test names story ${id}, which is still ⬜ in ${s.file}`);
  }
  return { errors, hints };
}

export function checkCounters(readme, stories) {
  const counts = new Map();
  for (const s of stories) counts.set(s.epic, (counts.get(s.epic) ?? 0) + 1);
  const errors = [];
  let sumRow = null;
  for (const line of readme.split("\n")) {
    const cells = line.split("|").map((c) => c.trim());
    if (cells.length < 4) continue;
    const epic = cells[1].match(/^([A-Z]{2,4})\s/)?.[1];
    if (epic && /^\d+$/.test(cells[2])) {
      const actual = counts.get(epic) ?? 0;
      if (Number(cells[2]) !== actual)
        errors.push(
          `README counter for epic ${epic} is ${cells[2]} but the specs define ${actual}`,
        );
      counts.delete(epic);
    } else if (/^\*\*Summe\*\*$/.test(cells[1])) sumRow = Number(cells[2].replace(/\*/g, ""));
  }
  for (const [epic, n] of counts) errors.push(`epic ${epic} (${n} stories) is missing in README`);
  if (sumRow !== null && sumRow !== stories.length)
    errors.push(`README total is ${sumRow} but the specs define ${stories.length} stories`);
  return errors;
}

export function unresolvedRefs(files) {
  const defined = new Set();
  for (const text of Object.values(files))
    for (const line of text.split("\n")) {
      const id = line.match(DEF)?.[1];
      if (id) defined.add(id);
    }
  const missing = [];
  for (const [file, text] of Object.entries(files))
    text.split("\n").forEach((line, i) => {
      for (const id of line.match(REF) ?? [])
        if (!defined.has(id)) missing.push(`${id} (${path.basename(file)}:${i + 1})`);
    });
  return missing;
}

function readTree(root, dir, ok) {
  const out = {};
  const walk = (d) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (e.name !== "node_modules" && e.name !== "dist") walk(p);
      } else if (ok(p)) out[path.relative(root, p)] = fs.readFileSync(p, "utf8");
    }
  };
  walk(dir);
  return out;
}

export function run(root) {
  const specDir = path.join(root, "Docs/PRODUKT-SPECS");
  const specs = readTree(root, specDir, (p) => p.endsWith(".md"));
  const isTest = (p) => /\.test\.(ts|tsx|mjs)$/.test(p);
  const tests = {
    ...readTree(root, path.join(root, "app/packages"), isTest),
    ...readTree(root, path.join(root, "app/scripts"), isTest),
    ...readTree(root, path.join(root, ".claude/hooks"), isTest),
  };
  const stories = parseStories(specs);
  const trace = traceability(stories, testedIds(tests));
  const readme = specs[path.relative(root, path.join(specDir, "README.md"))] ?? "";
  const errors = [...trace.errors, ...checkCounters(readme, stories)];
  const refs = unresolvedRefs(specs);
  return { stories, errors, hints: trace.hints, refs };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { stories, errors, hints, refs } = run(fileURLToPath(new URL("../../", import.meta.url)));
  hints.forEach((h) => console.log(`check-traceability: hint: ${h}`));
  if (refs.length)
    console.log(
      `check-traceability: hint: ${refs.length} unresolved references (report only): ${refs.join(", ")}`,
    );
  errors.forEach((e) => console.error(`check-traceability: ${e}`));
  if (errors.length) process.exit(1);
  console.log(`check-traceability: ${stories.length} stories, counters and traceability ok`);
}
