// Gate QG-U6 (DS-08, FR-QG-09): budget for the initial JavaScript of the built web app, measured in gzip bytes.
// Runs on `packages/web/dist` after `npm run build`; needs no browser. Usage:
//   node tools/check/supply/check-bundle-budget.mjs [--report] [dist-dir]
//   --report  print the measurement and the verdict but always exit 0 (report-only phase)
//
// What counts as "initial" (everything a first visit downloads before the current route renders):
//   1. the module script of `index.html` (the entry chunk),
//   2. every `<link rel="modulepreload">` of `index.html` (Vite lists the shared chunks there),
//   3. every chunk those files import statically (`import ... from "./x.js"`, `import "./x.js"`), recursively.
// Dynamic `import("./x.js")` is not followed: lazily loaded route chunks (DS-08) are not initial.
// CSS, images and fonts are not counted. Size is the gzip size (level 9) of the files, 1 kB = 1000 bytes
// (the unit Vite prints). The limit lives in quality-limits.json (`bundle.initialJsGzipBytes`, FR-QG-16/18):
// measured value plus headroom, only ever lowered.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

export function readBudget(
  file = new URL("../../../config/gates/quality-limits.json", import.meta.url),
) {
  return JSON.parse(fs.readFileSync(file, "utf8")).bundle.initialJsGzipBytes;
}

export const INITIAL_JS_BUDGET_BYTES = readBudget();

export const DEFAULT_DIST = fileURLToPath(new URL("../../../packages/web/dist", import.meta.url));

export const formatKb = (bytes) => `${(bytes / 1000).toFixed(1)} kB`;

/** Relative module specifiers a chunk imports statically; `import(...)` calls are excluded. */
export function staticImports(source) {
  const found = new Set();
  // `import{a}from"./x.js"`, `import x from './x.js'`, `export*from"./x.js"`, `export{a}from"./x.js"`
  for (const m of source.matchAll(/\b(?:import|export)\b[^;"'`()]*?\bfrom\s*["'](\.[^"']+)["']/g))
    found.add(m[1]);
  // side-effect import: `import"./x.js"` (but not `import("./x.js")`)
  for (const m of source.matchAll(/\bimport\s*["'](\.[^"']+)["']/g)) found.add(m[1]);
  return [...found];
}

function htmlEntries(html) {
  const refs = [];
  for (const tag of html.match(/<(?:script|link)\b[^>]*>/gi) ?? []) {
    const isEntry = /<script\b/i.test(tag) && /\btype=["']module["']/i.test(tag);
    const isPreload = /<link\b/i.test(tag) && /\brel=["']modulepreload["']/i.test(tag);
    if (!isEntry && !isPreload) continue;
    const ref = tag.match(/\b(?:src|href)=["']([^"']+)["']/i)?.[1];
    if (ref) refs.push({ ref, entry: isEntry });
  }
  return refs;
}

/** Absolute paths of all initial JS files of a built app (see the rule at the top). */
export function initialChunks(dist) {
  const html = fs.readFileSync(path.join(dist, "index.html"), "utf8");
  const refs = htmlEntries(html);
  if (!refs.some((r) => r.entry))
    throw new Error(`no module entry script found in ${path.join(dist, "index.html")}`);
  const seen = new Set();
  const visit = (file) => {
    if (seen.has(file)) return;
    if (!fs.existsSync(file)) throw new Error(`initial chunk not found: ${file}`);
    seen.add(file);
    for (const spec of staticImports(fs.readFileSync(file, "utf8")))
      visit(path.resolve(path.dirname(file), spec));
  };
  for (const { ref } of refs) visit(path.join(dist, ref.replace(/^\//, "")));
  return [...seen];
}

export function measureInitial(dist) {
  const files = initialChunks(dist).map((file) => ({
    file: path.relative(dist, file),
    bytes: zlib.gzipSync(fs.readFileSync(file), { level: 9 }).length,
  }));
  return { files, total: files.reduce((sum, f) => sum + f.bytes, 0) };
}

export function checkBudget(total, max = INITIAL_JS_BUDGET_BYTES) {
  const ok = total <= max;
  const message = ok
    ? `initial JS ${formatKb(total)} gzip, allowed ${formatKb(max)}`
    : `initial JS is ${formatKb(total)} gzip, allowed ${formatKb(max)} (over by ${formatKb(total - max)}). ` +
      `Load the new code lazily (React.lazy, DS-08) or lower the cost; the limit is bundle.initialJsGzipBytes in app/config/gates/quality-limits.json and is only ever lowered.`;
  return { ok, message };
}

function main(argv) {
  const report = argv.includes("--report");
  const dist = argv.find((a) => !a.startsWith("--")) ?? DEFAULT_DIST;
  if (!fs.existsSync(path.join(dist, "index.html"))) {
    console.error(
      `bundle budget: ${dist}/index.html not found; run \`npm run build -w @pflanzendex/web\` first`,
    );
    return 1;
  }
  const { files, total } = measureInitial(dist);
  for (const f of files.sort((a, b) => b.bytes - a.bytes))
    console.log(`  ${formatKb(f.bytes).padStart(10)}  ${f.file}`);
  const { ok, message } = checkBudget(total);
  console.log(`bundle budget (QG-U6, DS-08): ${message}`);
  return ok || report ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
