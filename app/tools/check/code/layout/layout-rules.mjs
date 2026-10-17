// Rules LY-1 to LY-5 over a path list. Returns findings { rule, dir, value, items }.
import { isKebab, buildTree, isIgnored, matchDir, stemOf, unitCount } from "./layout-tree.mjs";

const finding = (rule, dir, items) => ({
  rule,
  dir: dir || ".",
  value: items.length,
  items,
});
const isTestOrStory = (n) => /\.(test|stories)\.tsx?$/.test(n);

function nameOk(name, kind, config) {
  if (kind === "file" && config.namedFiles.includes(name)) return true;
  return isKebab(kind === "dir" ? name : stemOf(name));
}

function rootFindings(children, config) {
  const bad = [...children]
    .filter(([n, k]) => !(k === "file" ? config.rootFiles : config.rootDirs).includes(n))
    .map(([n]) => n);
  return bad.length ? [finding("LY-5", "", bad)] : [];
}

function fanoutFindings(dir, children, rule, config) {
  const counted =
    dir === "" ? [...children].filter(([n]) => !config.rootFiles.includes(n)) : children;
  const units = unitCount(new Map(counted));
  const limit = rule?.maxUnits ?? config.maxUnits;
  if (units <= limit) return [];
  return [
    {
      rule: "LY-1",
      dir: dir || ".",
      value: units,
      items: [`${units} units, limit ${limit}`],
    },
  ];
}

function dirFindings(dir, children, config) {
  const rule = config.dirs.find((r) => matchDir(r.path, dir));
  const out = dir === "" ? rootFindings(children, config) : [];
  if (rule?.collection) {
    const bad = [...children.keys()].filter((n) => !rule.collection.test(n));
    return bad.length ? [...out, finding("LY-2", dir, bad)] : out;
  }
  out.push(...fanoutFindings(dir, children, rule, config));
  const badNames = [...children].filter(([n, k]) => !nameOk(n, k, config)).map(([n]) => n);
  return badNames.length ? [...out, finding("LY-3", dir, badNames)] : out;
}

// LY-4: a component x.tsx lives in a directory x/.
function componentFindings(paths, config) {
  const byDir = new Map();
  for (const p of paths) {
    const parts = p.split("/");
    const name = parts.at(-1);
    const dir = parts.slice(0, -1).join("/");
    if (!config.componentRoots.some((r) => dir === r || dir.startsWith(`${r}/`))) continue;
    if (!name.endsWith(".tsx") || isTestOrStory(name)) continue;
    if (config.componentExempt.includes(stemOf(name))) continue;
    if (parts.at(-2) === stemOf(name)) continue;
    byDir.set(dir, [...(byDir.get(dir) ?? []), name]);
  }
  return [...byDir].map(([dir, items]) => finding("LY-4", dir, items));
}

export function findLayout(allPaths, config) {
  const paths = allPaths.filter((p) => !isIgnored(p));
  const findings = [...buildTree(paths)].flatMap(([dir, kids]) => dirFindings(dir, kids, config));
  return [...findings, ...componentFindings(paths, config)];
}
