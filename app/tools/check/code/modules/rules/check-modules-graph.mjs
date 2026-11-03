// Module graph checks of AB-8 and AB-12 (cycles, a module importing every other), part of check-modules.mjs.
import path from "node:path";

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
