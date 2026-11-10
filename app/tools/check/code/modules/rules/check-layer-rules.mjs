// Layer rules AB-3 and AB-4 (FR-QG-05), called from check-boundaries.mjs next to the module rules; AB-5 sits in
// check-sharing-layer.mjs. Every message carries rule ID, file and line.
//   AB-3  the AI layer (`api/src/ai`) reaches data only through validating operations (KI-R1): no raw SQL, no `pg` value
//         import, no method call on a repository of a foreign module (it may only construct one and hand it to an
//         operation), and the MCP tools (`ai/mcp`) import neither `pg` nor `@pflanzendex/db` (they call routes)
//   AB-4  the Pokédex build job writes only to its tree store: the job code in `core` imports nothing but `pokedex` and the
//         kernel, the tree adapter writes only `taxon`, the job wiring in `api` uses only the listed adapters
import fs from "node:fs";
import path from "node:path";
import { locate, moduleOf } from "../check-modules.mjs";
import { checkSharingLayer } from "./check-sharing-layer.mjs";

const isTest = (f) => /\.test\.[a-z]+$/.test(f);
const lineOf = (text, index) => text.slice(0, index).split("\n").length;
const AI_OWN_MODULES = ["ai", "kernel"]; // adapters the AI layer may call directly (its own tables, shared plumbing)
const TREE_STORE = { file: "packages/db/src/pokedex/taxonomy.ts", tables: ["taxon"] };
const JOB_ADAPTERS = {
  TaxonomyPostgres: null,
  JobsPostgres: null,
  SpeciesPostgres: ["approvedLatinNames"],
}; // null = handed on only
const JOB_NAME = /^taxonomy-job[a-z-]*\.ts$/;

/** Class name -> module for every exported adapter class of `db` (`export class X` in db/src/<module>/). */
function adapterModules({ appDir, cfg, h }) {
  const map = new Map();
  for (const file of h.walkCode(path.join(appDir, "packages", "db", "src"))) {
    const mod = moduleOf(locate(appDir, file), cfg);
    if (!mod || isTest(file)) continue;
    for (const m of fs.readFileSync(file, "utf8").matchAll(/^export class (\w+)/gm))
      map.set(m[1], mod);
  }
  return map;
}

const importedNames = (src, from) =>
  [...src.matchAll(/import\s+(?!type\b)\{([^}]*)\}\s*from\s*["']([^"']+)["']/g)]
    .filter((m) => m[2] === from)
    .flatMap((m) =>
      m[1]
        .split(",")
        .map((n) => n.trim().split(/\s+as\s+/)[0])
        .filter(Boolean),
    );

function foreignRepositoryCalls(src, foreign) {
  const out = [];
  for (const cls of foreign) {
    const direct = new RegExp(`new ${cls}\\([^)]*\\)\\s*\\.(\\w+)`, "g"); // eslint-disable-line security/detect-non-literal-regexp -- class names of our own code
    for (const m of src.matchAll(direct)) out.push([m.index, `new ${cls}(...).${m[1]}()`]);
    const bound = new RegExp(`(?:const|let)\\s+(\\w+)\\s*=\\s*new ${cls}\\(`, "g"); // eslint-disable-line security/detect-non-literal-regexp -- idem
    for (const b of src.matchAll(bound)) {
      const use = new RegExp(`(?<![\\w.$"'\`/-])${b[1]}\\.(\\w+)`, "g"); // eslint-disable-line security/detect-non-literal-regexp -- idem
      for (const m of src.matchAll(use)) out.push([m.index, `${b[1]}.${m[1]}() on ${cls}`]);
    }
  }
  return out;
}

function checkAiLayer(ctx) {
  const { appDir, add, h } = ctx;
  const classes = adapterModules(ctx);
  const aiDir = path.join(appDir, "packages", "api", "src", "ai");
  for (const file of h.walkCode(aiDir).filter((f) => !isTest(f))) {
    const src = h.stripComments(fs.readFileSync(file, "utf8"));
    const rel = path.relative(aiDir, file).split(path.sep);
    const problem = (index, msg) => add("AB-3", file, lineOf(src, index), msg);
    for (const m of src.matchAll(/import\s+(?!type\b)[^'";]*?from\s*["']pg["']/g))
      problem(
        m.index,
        `value import of "pg": the AI layer reaches data only through operations (KI-R1)`,
      );
    for (const m of src.matchAll(/\b(?:pool|client)\.(?:query|connect)\s*\(/g))
      problem(
        m.index,
        `raw database call ${m[0]}: the AI layer calls validating operations only (KI-R1)`,
      );
    if (rel[0] === "mcp" && importedNames(src, "@pflanzendex/db").length)
      problem(0, `the MCP tools call routes, never the database package (KI-R1, KI-R8)`);
    const foreign = importedNames(src, "@pflanzendex/db").filter(
      (n) => classes.has(n) && !AI_OWN_MODULES.includes(classes.get(n)),
    );
    for (const [index, what] of foreignRepositoryCalls(src, foreign))
      problem(
        index,
        `${what}: hand the repository to a validating operation instead of calling it (KI-R1)`,
      );
  }
}

function checkJobCore(ctx) {
  const { appDir, add, cfg, h } = ctx;
  const dir = path.join(appDir, "packages", "core", "src", "pokedex", "taxonomy");
  for (const file of h.walkCode(dir).filter((f) => !isTest(f)))
    for (const { spec, line } of h.importsOf(fs.readFileSync(file, "utf8"))) {
      if (!spec.startsWith(".")) continue;
      const to = moduleOf(locate(appDir, path.resolve(path.dirname(file), spec)), cfg);
      if (to && to !== "pokedex" && to !== cfg.KERNEL)
        add(
          "AB-4",
          file,
          line,
          `pokedex -> ${to}: the build job reads names through CatalogNames and writes only through TaxonomyStore`,
        );
    }
}

function checkTreeStore({ appDir, add, h }) {
  const file = path.join(appDir, TREE_STORE.file);
  if (!fs.existsSync(file)) return;
  const src = h.stripComments(fs.readFileSync(file, "utf8"));
  for (const m of src.matchAll(
    /(?<!do )\b(insert into|update|delete from|truncate table|truncate) "?(\w+)/gi,
  ))
    if (!TREE_STORE.tables.includes(m[2].toLowerCase()))
      add(
        "AB-4",
        file,
        lineOf(src, m.index),
        `SQL "${m[0]}": the tree store writes only ${TREE_STORE.tables.join(", ")}`,
      );
}

function checkJobWiring({ appDir, add, h }) {
  const dir = path.join(appDir, "packages", "api", "src", "pokedex");
  for (const file of h.walkCode(dir).filter((f) => JOB_NAME.test(path.basename(f)))) {
    const src = h.stripComments(fs.readFileSync(file, "utf8"));
    const problem = (index, msg) => add("AB-4", file, lineOf(src, index), msg);
    for (const name of importedNames(src, "@pflanzendex/db"))
      if (!(name in JOB_ADAPTERS))
        problem(
          src.indexOf(name),
          `adapter ${name} is not part of the build job: it writes only to its tree store`,
        );
    for (const m of src.matchAll(/new (\w+)\([^)]*\)\.?(\w*)/g)) {
      const reads = JOB_ADAPTERS[m[1]];
      if (reads && !reads.includes(m[2] ?? ""))
        problem(m.index, `${m[0]}: the job may only call ${reads.join(", ")} on ${m[1]}`);
    }
  }
}

export function checkLayerRules(ctx) {
  checkAiLayer(ctx);
  checkJobCore(ctx);
  checkTreeStore(ctx);
  checkJobWiring(ctx);
  checkSharingLayer(ctx);
}
