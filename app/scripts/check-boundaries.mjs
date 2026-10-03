// Architecture boundaries and structure (FR-QG-04, FR-QG-05), with rule ID and path in every message.
//   AB-1  `core` imports nothing from API, web, database, file system or network
//   AB-2  API and web import `core` only through its public interface (package root)
//   AB-6  web imports neither API nor database (NFR-ARC-01 of the earlier draft: HTTP only)
//   MK-1  marker STRUCTURE_IGNORE / MAX_LINES_IGNORE (first 5 lines) without a reason
//   EX-1  entry in KNOWN_EXCEPTIONS without a reason
//   ST-c  every directory with code in `core` has an `index.ts`
// Known, deliberately accepted legacy belongs in KNOWN_EXCEPTIONS (with a reason; the list may only shrink).
import fs from "node:fs";
import path from "node:path";
import { builtinModules } from "node:module";
import { fileURLToPath } from "node:url";

export const CORE_ALLOWED_IMPORTS = []; // third-party packages allowed in core (empty on purpose; later e.g. zod)
export const CORE_TEST_ALLOWED_IMPORTS = ["vitest"];
export const KNOWN_EXCEPTIONS = []; // entries: { rule, file, reason }

export const MARKERS = ["STRUCTURE_IGNORE", "MAX_LINES_IGNORE"];
// Markers in the first 5 lines: { name, reason } (empty reason = marker without a reason = error MK-1).
export function markersOf(src) {
  const head = src.split("\n").slice(0, 5).join("\n");
  return MARKERS.flatMap((name) => {
    const m = head.match(new RegExp(`\\b${name}\\b(?::[ \\t]*([^\\n]*))?`));
    return m ? [{ name, reason: (m[1] ?? "").replace(/\*\/\s*$/, "").trim() }] : [];
  });
}
export const hasMarker = (src, name) =>
  markersOf(src).some((m) => m.name === name && m.reason !== "");

const isTest = (f) => /\.test\.(ts|tsx|mjs)$/.test(f);
const CODE = /\.(ts|tsx)$/;

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name === "node_modules" || e.name === "dist") return [];
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

export const walkCode = (dir) => walk(dir).filter((f) => CODE.test(f));

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .split("\n")
    .map((l) => (l.trim().startsWith("//") ? "" : l))
    .join("\n");
}

export function importsOf(src) {
  const code = stripComments(src);
  const res = [];
  const patterns = [
    /\b(?:import|export)\b[^;'"]*?\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const re of patterns)
    for (const m of code.matchAll(re)) {
      const line = code.slice(0, m.index).split("\n").length;
      res.push({ spec: m[1], line });
    }
  return res;
}

const isBuiltin = (spec) => spec.startsWith("node:") || builtinModules.includes(spec.split("/")[0]);
const isRelative = (spec) => spec.startsWith("./") || spec.startsWith("../");

function coreImportProblem(spec, file, coreRoot, allowed) {
  if (isRelative(spec)) {
    const target = path.resolve(path.dirname(file), spec);
    return path.relative(coreRoot, target).startsWith("..") ? `Import "${spec}" leaves core` : null;
  }
  if (isBuiltin(spec))
    return `Import "${spec}" (Node module: file system, network or process) is forbidden in core`;
  if (spec.startsWith("@pflanzendex/"))
    return `Import "${spec}" (other package) is forbidden in core`;
  return allowed.includes(spec)
    ? null
    : `Import "${spec}" is not allowed in core (allowlist CORE_ALLOWED_IMPORTS)`;
}

function checkCore(appDir, add) {
  const coreRoot = path.join(appDir, "packages", "core");
  for (const file of walk(path.join(coreRoot, "src")).filter((f) => CODE.test(f))) {
    const allowed = isTest(file)
      ? [...CORE_ALLOWED_IMPORTS, ...CORE_TEST_ALLOWED_IMPORTS]
      : CORE_ALLOWED_IMPORTS;
    for (const { spec, line } of importsOf(fs.readFileSync(file, "utf8"))) {
      const problem = coreImportProblem(spec, file, coreRoot, allowed);
      if (problem) add("AB-1", file, line, problem);
    }
  }
}

function consumerImportProblem(spec, file, coreRoot) {
  if (/^@pflanzendex\/core\/.+/.test(spec))
    return `Deep import "${spec}": only "@pflanzendex/core" is the public interface`;
  if (isRelative(spec) && path.resolve(path.dirname(file), spec).startsWith(coreRoot + path.sep))
    return `Relative import "${spec}" reaches into core: only "@pflanzendex/core" is allowed`;
  return null;
}

function checkConsumers(appDir, add) {
  const coreRoot = path.join(appDir, "packages", "core");
  for (const pkg of ["api", "web"]) {
    for (const file of walk(path.join(appDir, "packages", pkg, "src")).filter((f) =>
      CODE.test(f),
    )) {
      for (const { spec, line } of importsOf(fs.readFileSync(file, "utf8"))) {
        const problem = consumerImportProblem(spec, file, coreRoot);
        if (problem) add("AB-2", file, line, problem);
        const web = pkg === "web" && /^@pflanzendex\/(api|db)(\/|$)/.test(spec);
        if (web)
          add("AB-6", file, line, `Import "${spec}": web talks to API and database only over HTTP`);
      }
    }
  }
}

function checkStructure(appDir, add) {
  const coreSrc = path.join(appDir, "packages", "core", "src");
  const codeFiles = walk(coreSrc).filter(
    (f) => CODE.test(f) && !isTest(f) && !hasMarker(fs.readFileSync(f, "utf8"), "STRUCTURE_IGNORE"),
  );
  for (const dir of new Set(codeFiles.map((f) => path.dirname(f)))) {
    if (!fs.existsSync(path.join(dir, "index.ts")))
      add(
        "ST-c",
        path.join(dir, "index.ts"),
        0,
        "missing: every directory with code needs an index.ts as its public interface",
      );
  }
}

function checkMarkers(appDir, add) {
  for (const file of walk(path.join(appDir, "packages")).filter((f) => CODE.test(f)))
    for (const m of markersOf(fs.readFileSync(file, "utf8")))
      if (!m.reason)
        add("MK-1", file, 1, `Marker ${m.name} without a reason (format "${m.name}: <reason>")`);
}

export function checkProject(appDir) {
  const out = [];
  const add = (rule, file, line, msg) => {
    const rel = path.relative(appDir, file).split(path.sep).join("/");
    if (!KNOWN_EXCEPTIONS.some((e) => e.rule === rule && e.file === rel))
      out.push(`${rule} ${rel}${line ? ":" + line : ""} ${msg}`);
  };
  checkCore(appDir, add);
  checkConsumers(appDir, add);
  checkStructure(appDir, add);
  checkMarkers(appDir, add);
  for (const e of KNOWN_EXCEPTIONS)
    if (!e.reason?.trim())
      out.push(`EX-1 ${e.file} exception for ${e.rule} without a reason in KNOWN_EXCEPTIONS`);
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const violations = checkProject(appDir);
  if (violations.length) {
    console.error(violations.join("\n"));
    console.error(
      `\n${violations.length} architecture boundary or structure violation(s). Re-run with: npm run boundaries`,
    );
    process.exit(1);
  }
  console.log("Architecture boundaries and structure: no violations.");
}
