// Module rules for SQL and migrations (FR-QG-19, ADR 0003), called from check-boundaries.mjs.
//   AB-9   SQL in the adapters of a module (db/src/<module>/) touches only its own tables and those of `kern`
//   AB-13  a migration creates or changes a table that no module owns
//   AB-14  a migration names its module (file name `NNNN_<module>_<name>.sql` and first line `-- modul: <module>`)
//          and touches only the tables of that module and of `kern`; applied files are never renamed (LEGACY_MIGRATIONS)
//   AB-10  a foreign key in a migration to a registered global reference table (GLOBAL_REFERENCE_TABLES) needs an
//          allowed dependency on its owner, a plain `(id)` target and `on delete restrict`
import fs from "node:fs";
import path from "node:path";
import { locate, moduleOf } from "./check-modules.mjs";

const lineOf = (text, index) => text.slice(0, index).split("\n").length;
const tableOwners = (cfg) => new Map(cfg.MODULES.flatMap((m) => m.tables.map((t) => [t, m.name])));

const SQL_FROM = /\b(?:from|join|into|update)\s+"?([a-z_][a-z0-9_]*)/gi;

export function checkAdapterSql({ appDir, add, cfg, h }) {
  const owners = tableOwners(cfg);
  for (const file of h.walkCode(path.join(appDir, "packages", "db", "src"))) {
    const own = moduleOf(locate(appDir, file), cfg);
    if (!own) continue;
    const src = h.stripComments(fs.readFileSync(file, "utf8"));
    for (const m of src.matchAll(SQL_FROM)) {
      const owner = owners.get(m[1].toLowerCase());
      if (owner && owner !== own && owner !== cfg.KERN)
        add(
          "AB-9",
          file,
          lineOf(src, m.index),
          `${own} -> ${owner}: SQL on table ${m[1]} of module ${owner}; use its port`,
        );
    }
  }
}

// Applied to one normalized statement (lower case, single spaces, noise words and quotes removed).
const TOUCHES = [
  /\b(?:create|alter|drop) table ([a-z_]\w*)/g,
  /\btruncate (?:table )?([a-z_]\w*)/g,
  /\bcreate index .*? on ([a-z_]\w*)/g,
  /\bcreate (?:policy|trigger) .*? on ([a-z_]\w*)/g,
  /\bmandantenschutz\( ?'([a-z_]\w*)'/g,
];
const NOISE = new Set(["if", "not", "exists", "only", "unlogged", "unique"]);
const normalize = (stmt) =>
  stmt
    .toLowerCase()
    .replaceAll("public.", "")
    .replaceAll('"', "")
    .split(/\s+/)
    .filter((t) => t && !NOISE.has(t))
    .join(" ");

/** Statements of a migration with the line they start on (comments removed; `;` inside function bodies splits too). */
function statements(text) {
  const sql = text.replace(/--[^\n]*/g, (c) => " ".repeat(c.length));
  let offset = 0;
  return sql.split(";").map((stmt) => {
    const line = lineOf(sql, offset + stmt.length - stmt.trimStart().length);
    offset += stmt.length + 1;
    return { line, text: normalize(stmt) };
  });
}

function touchProblem({ add, cfg }, { file, declared, line }, table) {
  const owner = tableOwners(cfg).get(table);
  if (!owner) return add("AB-13", file, line, `table ${table} belongs to no module (register it)`);
  if (owner !== cfg.KERN && !declared.includes(owner))
    add(
      "AB-14",
      file,
      line,
      `${declared[0]} -> ${owner}: migration changes table ${table} of module ${owner}`,
    );
}

const REFERENCES = /\breferences ([a-z_]\w*)([^,]*)/g;

/** AB-10 on the SQL text: references to a global reference table (the live schema is checked in modul-schema.ts). */
function referenceProblems({ add, cfg }, { file, declared, line }, stmt) {
  const globals = cfg.GLOBAL_REFERENCE_TABLES ?? {};
  for (const m of stmt.matchAll(REFERENCES)) {
    const entry = globals[m[1]];
    if (!entry || declared.includes(entry.owner)) continue; // inside the owner module the rule does not apply
    const from = declared[0];
    const where = `foreign key to global reference table ${m[1]}`;
    const deps = cfg.MODULES.find((x) => x.name === from)?.dependsOn ?? [];
    if (from !== entry.owner && !deps.includes(entry.owner))
      add("AB-10", file, line, `${from} -> ${entry.owner}: ${where} without an allowed dependency`);
    if (!entry.reason?.trim()) add("AB-10", file, line, `${where} has no reason in the register`);
    if (m[2].match(/^ ?\(([^)]*)\)/)?.[1].trim() !== "id")
      add("AB-10", file, line, `${from} -> ${entry.owner}: ${where} only as a plain (id) target`);
    if (!/\bon delete restrict\b/.test(m[2]))
      add("AB-10", file, line, `${from} -> ${entry.owner}: ${where} needs on delete restrict`);
  }
}

function declaredModules(name, cfg) {
  if (name in cfg.LEGACY_MIGRATIONS) return cfg.LEGACY_MIGRATIONS[name];
  const rest = name.match(/^\d{4}_(.+)\.sql$/)?.[1] ?? "";
  const mod = cfg.MODULES.map((m) => m.name).find((n) => rest.startsWith(`${n}_`));
  return mod ? [mod] : null;
}

function checkMigration(ctx, file) {
  const { add, cfg } = ctx;
  const name = path.basename(file);
  const text = fs.readFileSync(file, "utf8");
  const declared = declaredModules(name, cfg);
  if (!declared)
    return add(
      "AB-14",
      file,
      1,
      "file name must be NNNN_<module>_<name>.sql with a registered module",
    );
  if (!(name in cfg.LEGACY_MIGRATIONS)) {
    const first = text.split("\n")[0].match(/^--\s*modul:\s*(\S+)\s*$/)?.[1];
    if (first !== declared[0])
      add(
        "AB-14",
        file,
        1,
        `first line must be "-- modul: ${declared[0]}" (found ${first ?? "none"})`,
      );
  }
  for (const stmt of statements(text)) {
    referenceProblems(ctx, { file, declared, line: stmt.line }, stmt.text);
    for (const re of TOUCHES)
      for (const m of stmt.text.matchAll(re)) touchProblem(ctx, { file, declared, ...stmt }, m[1]);
  }
}

/** AB-10, register part: every GLOBAL_REFERENCE_TABLES entry has a reason and names the module that owns the table. */
function checkGlobalTables({ appDir, add, cfg }) {
  const file = path.join(appDir, "modules.config.mjs");
  const owners = tableOwners(cfg);
  for (const [table, entry] of Object.entries(cfg.GLOBAL_REFERENCE_TABLES ?? {})) {
    if (!entry.reason?.trim())
      add(
        "AB-10",
        file,
        0,
        `global reference table ${table} has no reason (GLOBAL_REFERENCE_TABLES)`,
      );
    if (owners.get(table) !== entry.owner)
      add(
        "AB-10",
        file,
        0,
        `global reference table ${table}: owner ${entry.owner} does not own it (${owners.get(table) ?? "no module"})`,
      );
  }
}

export function checkMigrations(ctx) {
  const { appDir, add, cfg } = ctx;
  checkGlobalTables(ctx);
  const dir = path.join(appDir, "packages", "db", "migrations");
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql"));
  for (const legacy of Object.keys(cfg.LEGACY_MIGRATIONS))
    if (!files.includes(legacy))
      add("AB-14", path.join(dir, legacy), 0, "applied migration was renamed or removed");
  for (const f of files.sort()) checkMigration(ctx, path.join(dir, f));
}

const EXPORT_LISTS = /\bexport (?:type )?\{([^}]*)\}/g;
const EXPORT_DECLS = /\bexport (?:default )?(?:const|let|function|class|type|interface|enum) \w+/g;
const EXPORT_ASYNC = /\bexport (?:default )?async function \w+/g;
const EXPORT_STARS = /\bexport \*/g;

/** Number of exports in the public interface of `kern` (a measure, no threshold; AB-11). */
export function kernelExports({ appDir, cfg, h }) {
  let count = 0;
  for (const pkg of ["core", "db", "api", "web"]) {
    const file = path.join(appDir, "packages", pkg, "src", cfg.KERN, "index.ts");
    if (!fs.existsSync(file)) continue;
    const src = h.stripComments(fs.readFileSync(file, "utf8")).replace(/\s+/g, " ");
    for (const m of src.matchAll(EXPORT_LISTS))
      count += m[1].split(",").filter((n) => n.trim()).length;
    for (const re of [EXPORT_DECLS, EXPORT_ASYNC, EXPORT_STARS])
      count += (src.match(re) ?? []).length;
  }
  return count;
}
