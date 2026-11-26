// Rules LY-1 to LY-5 over a path list. Returns findings { rule, dir, value, items }.
import {
  buildTree,
  familyOf,
  globMatch,
  isIgnored,
  isKebab,
  matchDir,
  stemOf,
  unitCount,
} from "./layout-tree.mjs";

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

// Files a tool reads under a fixed name (config nameExempt, owner decision 2026-10-30): only the name rule is waived.
const nameExempt = (dir, name, config) =>
  (config.nameExempt ?? []).some((glob) => globMatch(glob, dir ? `${dir}/${name}` : name));

function rootFindings(children, config) {
  const bad = [...children]
    .filter(([n, k]) => !(k === "file" ? config.rootFiles : config.rootDirs).includes(n))
    .map(([n]) => n);
  return bad.length ? [finding("LY-5", "", bad)] : [];
}

// The entries that count as units (FR-QG-21): the root's whitelisted files do not, and a rule's `uncounted` pattern names
// the tool files of a package root (d-133). LY-3 still checks all of them.
const isCounted =
  (dir, rule, config) =>
  ([name, kind]) =>
    !(dir === "" && config.rootFiles.includes(name)) &&
    !(kind === "file" && rule?.uncounted?.test(name));

function fanoutFindings(dir, children, rule, config) {
  const units = unitCount(new Map([...children].filter(isCounted(dir, rule, config))));
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

// Automatic collection (FR-QG-21, d-133, d-135): a directory without a per-path rule that holds `autoCollectionMin` files of
// one extension family. Its files have no unit limit and LY-3 still applies to them; its subfolders still count as units
// against maxUnits (d-135), so 8 files with 9 subfolders fail LY-1.
function isAutoCollection(rule, children, config) {
  if (rule) return false;
  const perFamily = new Map();
  for (const [name, kind] of children) {
    const family = kind === "file" ? familyOf(name) : undefined;
    if (family) perFamily.set(family, (perFamily.get(family) ?? 0) + 1);
  }
  return Math.max(0, ...perFamily.values()) >= (config.autoCollectionMin ?? Infinity);
}

// The entries that count as units in an automatic collection (d-135): its subfolders; its files do not count.
const subfoldersOnly = (children) => new Map([...children].filter(([, kind]) => kind === "dir"));

function dirFindings(dir, children, config) {
  const rule = config.dirs.find((r) => matchDir(r.path, dir));
  const out = dir === "" ? rootFindings(children, config) : [];
  if (rule?.collection) {
    const bad = [...children.keys()].filter((n) => !rule.collection.test(n));
    return bad.length ? [...out, finding("LY-2", dir, bad)] : out;
  }
  const counted = isAutoCollection(rule, children, config) ? subfoldersOnly(children) : children;
  out.push(...fanoutFindings(dir, counted, rule, config));
  const badNames = [...children]
    .filter(([n, k]) => !nameOk(n, k, config) && !(k === "file" && nameExempt(dir, n, config)))
    .map(([n]) => n);
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
