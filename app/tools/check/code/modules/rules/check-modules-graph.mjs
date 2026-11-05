// Module graph checks of AB-8 and AB-12 (cycles, a module importing every other), part of check-modules.mjs.
import fs from "node:fs";
import path from "node:path";
import { WEB_LAYERS } from "../../../../../config/lint/module-rules.config.mjs";

const CONFIG_FILE = "config/lint/modules.config.mjs";

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

export function checkCycles({ appDir, add, cfg }, edges) {
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

export function checkAllModules({ add, cfg }, edges) {
  for (const m of cfg.MODULES) {
    if (m.name === cfg.KERNEL || cfg.MODULES.length < 3) continue;
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

/** Layer of a path below `packages/web/src/` (AB-15): "app", "shared", a module name or null (not checked). */
export function webLayerOf(rel, modules) {
  if (!rel.includes("/")) return /\.d\.ts$/.test(rel) ? null : "app";
  const hit = WEB_LAYERS.find(([prefix]) => rel.startsWith(prefix));
  if (hit) return hit[1];
  const folder = rel.split("/")[0];
  return modules.some((m) => m.name === folder) ? folder : null;
}

const toRel = (src, abs) => {
  const isDir = fs.existsSync(abs) && fs.statSync(abs).isDirectory();
  return path.relative(src, abs).split(path.sep).join("/") + (isDir ? "/" : "");
};
const describe = (layer) => (layer === "app" || layer === "shared" ? layer : `module ${layer}`);

// Findings of one file: [line, spec, target layer] for every import that breaks the direction.
function layerImports({ src, file, fromLayer, modules, h }) {
  const out = [];
  for (const { spec, line } of h.importsOf(fs.readFileSync(file, "utf8"))) {
    if (!spec.startsWith(".") && !spec.startsWith("@/")) continue;
    const abs = spec.startsWith("@/")
      ? path.join(src, spec.slice(2))
      : path.resolve(path.dirname(file), spec);
    const to = toRel(src, abs);
    const toLayer = to.startsWith("..") ? null : webLayerOf(to, modules);
    const bad = fromLayer === "shared" ? toLayer && toLayer !== "shared" : toLayer === "app";
    if (bad) out.push([line, spec, toLayer]);
  }
  return out;
}

// Imports that break the direction, one per hit: { file, from, line, text } with the text after rule and path.
function webLayerHits({ appDir, cfg, h }) {
  const src = path.join(appDir, "packages", "web", "src");
  if (!fs.existsSync(src)) return [];
  const out = [];
  for (const file of h.walkCode(src)) {
    const from = path.relative(src, file).split(path.sep).join("/");
    const fromLayer = webLayerOf(from, cfg.MODULES);
    if (fromLayer === "app" || fromLayer === null) continue;
    for (const [line, spec, toLayer] of layerImports({
      src,
      file,
      fromLayer,
      modules: cfg.MODULES,
      h,
    }))
      out.push({
        file,
        from,
        line,
        text: `${describe(fromLayer)} -> ${describe(toLayer)}: "${spec}"`,
      });
  }
  return out;
}

/** AB-15 findings as text lines (rule ID, file, line): shared imports no module and not app, a module imports not app. */
export function webLayerFindings(ctx) {
  return webLayerHits(ctx).map((v) => `AB-15 packages/web/src/${v.from}:${v.line} ${v.text}`);
}

/** AB-15 (blocking since FR-QG-23 step 5): every finding is a violation of check-boundaries. */
export function checkWebLayers(ctx) {
  for (const v of webLayerHits(ctx)) ctx.add("AB-15", v.file, v.line, v.text);
}
