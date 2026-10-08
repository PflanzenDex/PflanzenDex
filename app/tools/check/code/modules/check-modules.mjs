// Module boundaries (FR-QG-19, ADR 0003), called from check-boundaries.mjs. Rule ID, file and line in every message,
// import rules also name the violated edge (`bestand -> pflege`).
//   AB-7   a module is imported only through its `index.ts`; every module folder has one
//   AB-8   imports follow the dependency matrix of modules.config.mjs; cycles are always an error
//   AB-11  `kernel` imports no domain module (glossary words in kernel identifiers: check-modules-contracts.mjs)
//   AB-12  no coupling upwards (reverse of an allowed edge) and no module importing all others
//   AB-13  register consistency: unique names, known dependencies, one owner per table, no code outside a module
//          (port contract tests: check-modules-contracts.mjs)
// AB-9 (SQL on foreign tables), AB-14 (migrations) and AB-10 (global reference tables) live in check-modules-sql.mjs;
// AB-10 on the live schema in db/src/kern/modul-schema.ts.
// Folders named like a module are checked as soon as they exist; without them the checks are idle.
import fs from "node:fs";
import path from "node:path";
import { checkAllModules, checkCycles } from "./check-modules-graph.mjs";
import { checkKernelGlossary, checkPortContracts } from "./check-modules-contracts.mjs";

export const LAYERS = ["core", "db", "api", "web"];
const posix = (p) => p.split(path.sep).join("/");
const CONFIG_FILE = "modules.config.mjs";

/** Where a file or import target sits: layer package, folder below `src/` (null for root files) and the rest. */
export function locate(appDir, abs) {
  const parts = posix(path.relative(appDir, abs)).split("/");
  if (
    parts[0] !== "packages" ||
    parts[2] !== "src" ||
    !LAYERS.includes(parts[1]) ||
    parts.length < 4
  )
    return null;
  const [, pkg, , folder, ...rest] = parts;
  if (rest.length === 0 && path.extname(folder)) return { pkg, folder: null, rest: folder };
  return { pkg, folder, rest: rest.join("/") };
}

/** Name of the module a location belongs to, or null (root file, unmoduled folder, folder in transition). */
export function moduleOf(loc, cfg) {
  if (!loc?.folder) return null;
  if (`${loc.pkg}/${loc.folder}` in cfg.MODULE_FOLDERS_IN_TRANSITION) return null;
  return cfg.MODULES.some((m) => m.name === loc.folder) ? loc.folder : null;
}

const depsOf = (cfg, name) => cfg.MODULES.find((m) => m.name === name)?.dependsOn ?? [];

function checkRegister({ appDir, add, cfg }) {
  const file = path.join(appDir, CONFIG_FILE);
  const names = new Set();
  const owner = new Map();
  for (const m of cfg.MODULES) {
    if (names.has(m.name)) add("AB-13", file, 0, `module ${m.name} is registered twice`);
    names.add(m.name);
    for (const t of m.tables)
      if (owner.has(t))
        add("AB-13", file, 0, `table ${t} has two owners (${owner.get(t)} and ${m.name})`);
      else owner.set(t, m.name);
  }
  for (const m of cfg.MODULES)
    for (const d of m.dependsOn)
      if (!names.has(d)) add("AB-13", file, 0, `${m.name} depends on unknown module ${d}`);
      else if (d === m.name) add("AB-8", file, 0, `${m.name} depends on itself`);
  const kernel = cfg.MODULES.find((m) => m.name === cfg.KERNEL);
  if (kernel?.dependsOn.length)
    add("AB-11", file, 0, `${cfg.KERNEL} may depend on no module (${kernel.dependsOn.join(", ")})`);
  for (const m of cfg.MODULES)
    if (cfg.MODULES.length > 2 && m.name !== cfg.KERNEL && m.dependsOn.length >= names.size - 1)
      add("AB-12", file, 0, `${m.name} may depend on every other module: only the root may`);
}

const DESIGN_SYSTEM_FOLDERS = ["components", "lib", "platform", "styles"]; // no modules: docs/guides/design-system.md section 1
function checkFolders({ appDir, add, cfg, h }) {
  const seen = new Set();
  for (const pkg of LAYERS) {
    const src = path.join(appDir, "packages", pkg, "src");
    if (!fs.existsSync(src)) continue;
    for (const e of fs.readdirSync(src, { withFileTypes: true }).filter((d) => d.isDirectory())) {
      if (pkg === "web" && DESIGN_SYSTEM_FOLDERS.includes(e.name)) continue;
      const key = `${pkg}/${e.name}`;
      const dir = path.join(src, e.name);
      if (!h.walk(dir).some((f) => h.CODE.test(f))) continue;
      seen.add(key);
      if (key in cfg.MODULE_FOLDERS_IN_TRANSITION || key in cfg.UNMODULED_FOLDERS) continue;
      if (!cfg.MODULES.some((m) => m.name === e.name))
        add("AB-13", dir, 0, `folder ${key} belongs to no module (register it in ${CONFIG_FILE})`);
      else if (!fs.existsSync(path.join(dir, "index.ts")))
        add("AB-7", path.join(dir, "index.ts"), 0, `missing: module ${e.name} needs an index.ts`);
    }
  }
  for (const key of [
    ...Object.keys(cfg.UNMODULED_FOLDERS),
    ...Object.keys(cfg.MODULE_FOLDERS_IN_TRANSITION),
  ])
    if (!seen.has(key))
      add(
        "AB-13",
        path.join(appDir, CONFIG_FILE),
        0,
        `transition entry ${key} is stale: remove it`,
      );
}

// Test files and test helpers (`testhilfe.ts`) are not part of the public interface (kept out of the barrel on purpose):
// test files may import any internal file of a module, and `testhilfe` may be imported across modules. The
// dependency matrix (AB-8, AB-11, AB-12) still applies to them.
const isTestFile = (f) => /\.test\.[a-z]+$/.test(f);
const isPublic = (rest) =>
  rest === "" || (!rest.includes("/") && path.parse(rest).name === "index");
const isTestHelper = (rest) => path.parse(rest).name === "test-helpers";

function importProblem(cfg, from, to) {
  const edge = `${from ?? "root"} -> ${to}`;
  if (from === to) return null;
  if (from === cfg.KERNEL)
    return ["AB-11", `${edge}: ${cfg.KERNEL} imports no domain module (fachfreier Kern)`];
  if (from === null || depsOf(cfg, from).includes(to)) return null;
  if (depsOf(cfg, to).includes(from))
    return ["AB-12", `${edge}: coupling upwards; define a port in ${from} and wire it in the root`];
  return ["AB-8", `${edge}: not in the dependency matrix of ${CONFIG_FILE}`];
}

function checkImports({ appDir, add, cfg, h }) {
  const edges = new Map();
  for (const pkg of LAYERS)
    for (const file of h.walkCode(path.join(appDir, "packages", pkg, "src"))) {
      const from = moduleOf(locate(appDir, file), cfg);
      for (const { spec, line } of h.importsOf(fs.readFileSync(file, "utf8"))) {
        if (!spec.startsWith(".")) continue;
        const loc = locate(appDir, path.resolve(path.dirname(file), spec));
        const to = moduleOf(loc, cfg);
        if (!to || to === from) continue;
        const edge = `${from ?? "root"} -> ${to}`;
        if (!isPublic(loc.rest) && !isTestFile(file) && !isTestHelper(loc.rest))
          add("AB-7", file, line, `${edge}: "${spec}" bypasses index.ts (public interface only)`);
        const problem = importProblem(cfg, from, to);
        if (problem) add(problem[0], file, line, problem[1]);
        if (from) edges.set(`${from} ${to}`, edges.get(`${from} ${to}`) ?? { file, line });
      }
    }
  return edges;
}

export function checkModules(ctx) {
  if (!ctx.cfg.MODULES.length) return;
  checkRegister(ctx);
  checkFolders(ctx);
  const edges = checkImports(ctx);
  checkCycles(ctx, edges);
  checkAllModules(ctx, edges);
  checkKernelGlossary(ctx);
  checkPortContracts(ctx);
}
