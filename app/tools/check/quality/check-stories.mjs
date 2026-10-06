// Gate QG-U5 (US-QS-07): every component in components/ui and components/shared has a story that covers
// its variants and states. The script checks mechanically that the required exports exist; whether a story
// is meaningful stays a review question. There is no baseline and no exception list.
//   <name>.tsx            needs <name>.stories.tsx next to it
//   Default               always exported
//   AllVariants           when the source has cva( variants; every option of every variant key appears
//                         as a word in the story file (the key itself, e.g. `size`, is not required)
//   Disabled / Invalid    when the source mentions the `disabled` / `aria-invalid` prop or attribute
//   Loading (or Pending)  when the source mentions loading / pending
// Comments and Tailwind modifiers (`disabled:`, `aria-invalid:`) do not count as a mention.
// Light/dark come from the global toolbar, so they are not a story state. Focus has no mechanical trigger.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const COMPONENT_DIRS = ["ui", "shared"];

const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

// Parse the `{ key: { option: ..., option: ... } }` object after `variants:` of every cva( call.
export function cvaVariants(source) {
  const out = [];
  const code = stripComments(source);
  for (const call of code.matchAll(/\bcva\(/g)) {
    const at = code.indexOf("variants:", call.index);
    if (at < 0) continue;
    const open = code.indexOf("{", at);
    const body = balanced(code, open);
    if (!body) continue;
    for (const [key, inner] of topLevelObjects(body)) {
      for (const option of topLevelKeys(inner)) out.push({ key, option });
    }
  }
  return out;
}

// Returns the text between the brace at `open` and its partner (strings are skipped).
function balanced(text, open) {
  let depth = 0;
  let quote = null;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return text.slice(open + 1, i);
  }
  return null;
}

// Top-level entries of an object body as [key, valueText]; strings, nested braces and parens are skipped.
function entries(body) {
  const res = [];
  let i = 0;
  while (i < body.length) {
    const key = /^[\s,]*(?:["']([^"']+)["']|([\w$-]+))\s*:/.exec(body.slice(i));
    if (!key) break;
    i += key[0].length;
    const start = i;
    let depth = 0;
    let quote = null;
    for (; i < body.length; i++) {
      const c = body[i];
      if (quote) {
        if (c === "\\") i++;
        else if (c === quote) quote = null;
      } else if (c === '"' || c === "'" || c === "`") quote = c;
      else if ("{([".includes(c)) depth++;
      else if ("})]".includes(c)) depth--;
      else if (c === "," && depth === 0) break;
    }
    res.push([key[1] ?? key[2], body.slice(start, i)]);
  }
  return res;
}

const topLevelObjects = (body) =>
  entries(body).flatMap(([key, value]) => {
    const open = value.indexOf("{");
    const inner = open < 0 ? null : balanced(value, open);
    return inner === null ? [] : [[key, inner]];
  });

const topLevelKeys = (body) => entries(body).map(([key]) => key);

export function supportedStates(source) {
  const code = stripComments(source);
  const states = [];
  if (/(?<![\w:-])disabled(?![\w:-])/.test(code)) states.push(["Disabled"]);
  if (/(?<![\w:-])aria-invalid(?![\w:-])/.test(code)) states.push(["Invalid"]);
  if (/(?<![\w:-])(loading|pending)(?![\w:-])/i.test(code)) states.push(["Loading", "Pending"]);
  return states;
}

export function storyExports(source) {
  return new Set(
    [...source.matchAll(/export\s+(?:const|function|class)\s+(\w+)/g)].map((m) => m[1]),
  );
}

// Words of a story file; an option counts as covered when it appears as a whole word (`ghost`, `2xl`).
const words = (text) => new Set(text.match(/[\w-]+/g) ?? []);

function variantProblems(source, story, storyRel, exported) {
  const variants = cvaVariants(source);
  if (variants.length === 0) return [];
  const problems = [];
  if (!exported.has("AllVariants"))
    problems.push(`QG-U5 ${storyRel}: missing export AllVariants (the component has cva variants)`);
  const seen = words(story);
  for (const { key, option } of variants)
    if (!seen.has(option))
      problems.push(`QG-U5 ${storyRel}: ${key} "${option}" never appears in the story`);
  return problems;
}

// Returns a list of problem strings (empty = pass) for one web package root.
export function check(webRoot) {
  const problems = [];
  for (const dir of COMPONENT_DIRS) {
    const full = path.join(webRoot, "src/components", dir);
    if (!fs.existsSync(full)) continue;
    const files = fs.readdirSync(full, { withFileTypes: true }).filter((e) => e.isFile());
    for (const entry of files) {
      const m = entry.name.match(/^([^.]+)\.tsx$/);
      if (!m) continue; // tests, stories, .ts helpers
      const name = m[1];
      const rel = `components/${dir}/${entry.name}`;
      const storyName = `${name}.stories.tsx`;
      const storyPath = path.join(full, storyName);
      if (!fs.existsSync(storyPath)) {
        problems.push(`QG-U5 ${rel}: no ${storyName} next to it`);
        continue;
      }
      const source = fs.readFileSync(path.join(full, entry.name), "utf8");
      const story = fs.readFileSync(storyPath, "utf8");
      const storyRel = `components/${dir}/${storyName}`;
      const exported = storyExports(story);
      const need = (names, why) => {
        if (!names.some((n) => exported.has(n)))
          problems.push(`QG-U5 ${storyRel}: missing export ${names[0]}${why}`);
      };
      need(["Default"], "");
      problems.push(...variantProblems(source, story, storyRel, exported));
      for (const names of supportedStates(source)) need(names, ` (${rel} supports this state)`);
    }
  }
  return problems;
}

function main() {
  const problems = check("packages/web");
  if (problems.length > 0) {
    console.error(`Story check failed (QG-U5):\n${problems.map((p) => `  ${p}`).join("\n")}`);
    process.exit(1);
  }
  console.log(
    "Story check passed (every ui/shared component has a story with its variants and states).",
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
