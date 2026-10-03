// Module boundaries (FR-QG-19, ADR 0003), called from check-boundaries.mjs. Rule ID, file and line in every message,
// import rules also name the violated edge (`bestand -> pflege`).
//   AB-7   a module is imported only through its `index.ts`; every module folder has one
//   AB-8   imports follow the dependency matrix of modules.config.mjs; cycles are always an error
//   AB-11  `kern` imports no domain module
//   AB-12  no coupling upwards (reverse of an allowed edge) and no module importing all others
//   AB-13  register consistency: unique names, known dependencies, one owner per table, no code outside a module
// AB-9 (SQL on foreign tables) and AB-14 (migrations) live in check-modules-sql.mjs; AB-10 in db/src/modul-schema.ts.
// Folders named like a module are checked as soon as they exist; without them the checks are idle.
import fs from "node:fs";
import path from "node:path";

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

function findCycle(graph) {
  const state = new Map();
  const visit = (node, trail) => {
    if (state.get(node) === 2) return null;
    if (state.get(node) === 1) return [...trail.slice(trail.indexOf(node)), node];
    state.set(node, 1);
    for (const next of graph.get(node) ?? []) {
      const c = visit(next, [...trail, node]);
      if (c) return c;
    }
    state.set(node, 2);
    return null;
  };
  for (const node of graph.keys()) {
    const c = visit(node, []);
    if (c) return c;
  }
  return null;
}

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
  const kern = cfg.MODULES.find((m) => m.name === cfg.KERN);
  if (kern?.dependsOn.length)
    add("AB-11", file, 0, `${cfg.KERN} may depend on no module (${kern.dependsOn.join(", ")})`);
  for (const m of cfg.MODULES)
    if (cfg.MODULES.length > 2 && m.name !== cfg.KERN && m.dependsOn.length >= names.size - 1)
      add("AB-12", file, 0, `${m.name} may depend on every other module: only the root may`);
}

function checkFolders({ appDir, add, cfg, h }) {
  const seen = new Set();
  for (const pkg of LAYERS) {
    const src = path.join(appDir, "packages", pkg, "src");
    if (!fs.existsSync(src)) continue;
    for (const e of fs.readdirSync(src, { withFileTypes: true }).filter((d) => d.isDirectory())) {
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
const isTestHelper = (rest) => path.parse(rest).name === "testhilfe";

function importProblem(cfg, from, to) {
  const edge = `${from ?? "root"} -> ${to}`;
  if (from === to) return null;
  if (from === cfg.KERN)
    return ["AB-11", `${edge}: ${cfg.KERN} imports no domain module (fachfreier Kern)`];
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

function checkCycles({ appDir, add, cfg }, edges) {
  const graph = new Map(cfg.MODULES.map((m) => [m.name, new Set(m.dependsOn)]));
  const first = new Map();
  for (const [key, where] of edges) {
    const [a, b] = key.split(" ");
    graph.get(a)?.add(b);
    first.set(key, where);
  }
  const cycle = findCycle(graph);
  if (!cycle) return;
  const where = first.get(`${cycle[0]} ${cycle[1]}`);
  add(
    "AB-8",
    where?.file ?? path.join(appDir, CONFIG_FILE),
    where?.line ?? 0,
    `cycle ${cycle.join(" -> ")}`,
  );
}

function checkAllModules({ add, cfg }, edges) {
  for (const m of cfg.MODULES) {
    if (m.name === cfg.KERN || cfg.MODULES.length < 3) continue;
    const used = new Set([...edges.keys()].filter((k) => k.startsWith(`${m.name} `)));
    if (used.size >= cfg.MODULES.length - 1) {
      const where = edges.get([...used][0]);
      add(
        "AB-12",
        where.file,
        where.line,
        `${m.name} imports every other module: only the root may`,
      );
    }
  }
}

export function checkModules(ctx) {
  if (!ctx.cfg.MODULES.length) return;
  checkRegister(ctx);
  checkFolders(ctx);
  const edges = checkImports(ctx);
  checkCycles(ctx, edges);
  checkAllModules(ctx, edges);
}
