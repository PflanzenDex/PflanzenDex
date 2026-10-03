// Architekturgrenzen und Struktur (FR-QG-04, FR-QG-05), mit Regel-ID und Pfad in jeder Meldung.
//   AB-1  `core` importiert nichts aus API, Web, Datenbank, Dateisystem oder Netz
//   AB-2  API und Web importieren `core` nur über die öffentliche Schnittstelle (Paketwurzel)
//   AB-6  Web importiert weder API noch Datenbank (NFR-ARC-01 der früheren Skizze: nur über HTTP)
//   MK-1  Marker STRUCTURE_IGNORE / MAX_LINES_IGNORE (erste 5 Zeilen) ohne Grund
//   EX-1  Eintrag in KNOWN_EXCEPTIONS ohne Grund
//   ST-c  jedes Verzeichnis mit Code in `core` hat einen `index.ts`
// Bekannte, bewusst akzeptierte Altlasten gehören in KNOWN_EXCEPTIONS (mit Begründung; darf nur kürzer werden).
import fs from "node:fs";
import path from "node:path";
import { builtinModules } from "node:module";
import { fileURLToPath } from "node:url";

export const CORE_ALLOWED_IMPORTS = []; // erlaubte Fremdpakete in core (bewusst leer; später z. B. zod)
export const CORE_TEST_ALLOWED_IMPORTS = ["vitest"];
export const KNOWN_EXCEPTIONS = []; // Einträge: { rule, file, reason }

export const MARKERS = ["STRUCTURE_IGNORE", "MAX_LINES_IGNORE"];
// Marker in den ersten 5 Zeilen: { name, reason } (reason leer = Marker ohne Grund = Fehler MK-1).
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
    return path.relative(coreRoot, target).startsWith("..")
      ? `Import "${spec}" verlässt core`
      : null;
  }
  if (isBuiltin(spec))
    return `Import "${spec}" (Node-Modul: Dateisystem, Netz oder Prozess) ist in core verboten`;
  if (spec.startsWith("@pflanzendex/"))
    return `Import "${spec}" (anderes Paket) ist in core verboten`;
  return allowed.includes(spec)
    ? null
    : `Import "${spec}" ist in core nicht erlaubt (Allowlist CORE_ALLOWED_IMPORTS)`;
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
    return `Tiefer Import "${spec}": nur "@pflanzendex/core" ist die öffentliche Schnittstelle`;
  if (isRelative(spec) && path.resolve(path.dirname(file), spec).startsWith(coreRoot + path.sep))
    return `Relativer Import "${spec}" greift in core hinein: nur "@pflanzendex/core" erlaubt`;
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
          add(
            "AB-6",
            file,
            line,
            `Import "${spec}": Web spricht mit API und Datenbank nur über HTTP`,
          );
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
        "fehlt: jedes Verzeichnis mit Code braucht einen index.ts als öffentliche Schnittstelle",
      );
  }
}

function checkMarkers(appDir, add) {
  for (const file of walk(path.join(appDir, "packages")).filter((f) => CODE.test(f)))
    for (const m of markersOf(fs.readFileSync(file, "utf8")))
      if (!m.reason)
        add("MK-1", file, 1, `Marker ${m.name} ohne Grund (Format "${m.name}: <Grund>")`);
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
      out.push(`EX-1 ${e.file} Ausnahme für ${e.rule} ohne Grund in KNOWN_EXCEPTIONS`);
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const violations = checkProject(appDir);
  if (violations.length) {
    console.error(violations.join("\n"));
    console.error(
      `\n${violations.length} Verstoß/Verstöße gegen Architekturgrenzen oder Struktur. Aufruf zum Wiederholen: npm run boundaries`,
    );
    process.exit(1);
  }
  console.log("Architekturgrenzen und Struktur: keine Verstöße.");
}
