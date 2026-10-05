// Plans the moves that bring one directory within the layout rules (US-QG-09, FR-QG-21). Pure: paths in, moves out.
//   0. LY-3 (only with `kebab`): files with a PascalCase, camelCase or snake_case name get a kebab-case name.
//   1. LY-4: a component x.tsx moves, with every file of the same stem, into a folder x/.
//   2. Groups chosen by a person (`into`): units that start with one of the prefixes move into the named folder.
//   3. LY-1 (unless `auto` is false): while the directory has too many units, the biggest groups of units that share a name prefix move into
//      a folder of that prefix (care-phases-api.ts, care-phases-list.ts -> phases/ inside care/); a folder that is
//      still too big is split again by the next name segment.
import path from "node:path";
import { isKebab, stemOf } from "../check/code/layout/layout-tree.mjs";

const posix = path.posix;
const isTestOrStory = (n) => /\.(test|stories)\.tsx?$/.test(n);
const underRoot = (dir, roots) => roots.some((r) => dir === r || dir.startsWith(`${r}/`));

// current: Map<old path, path after the planned moves>; every entry lies under the directory being planned.
function unitsOf(current, dir) {
  const units = new Map();
  for (const [old, now] of current) {
    if (!now.startsWith(`${dir}/`)) continue;
    const rel = now.slice(dir.length + 1);
    const first = rel.split("/")[0];
    const name = rel.includes("/") ? first : stemOf(first);
    units.set(name, [...(units.get(name) ?? []), [old, rel]]);
  }
  return units;
}

/** "CollectionPage.skeleton.tsx" -> "collection-page.skeleton.tsx"; the part after the first dot is kept. */
export function kebabName(name) {
  const dot = name.indexOf(".");
  const stem = dot === -1 ? name : name.slice(0, dot);
  const kebab = stem
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .replace(/[_\s]+/g, "-")
    .toLowerCase();
  return kebab + (dot === -1 ? "" : name.slice(dot));
}

function renameToKebab(current, dir, opts) {
  for (const [old, now] of current) {
    const name = now.slice(dir.length + 1);
    if (name.includes("/") || opts.namedFiles?.includes(name) || isKebab(stemOf(name))) continue;
    current.set(old, `${dir}/${kebabName(name)}`);
  }
}

function moveInto(current, dir, groups) {
  const units = unitsOf(current, dir);
  for (const { folder, prefixes } of groups) {
    for (const [name, entries] of units) {
      if (!prefixes.some((prefix) => name.startsWith(prefix))) continue;
      if (name === folder && entries.some(([, rel]) => rel.includes("/"))) continue; // already that folder
      for (const [old, rel] of entries) current.set(old, `${dir}/${folder}/${rel}`);
    }
  }
}

function componentFolders(current, dir, opts) {
  if (!underRoot(dir, opts.componentRoots)) return;
  const stems = new Set();
  for (const now of current.values()) {
    const name = now.slice(dir.length + 1);
    if (name.includes("/") || !name.endsWith(".tsx") || isTestOrStory(name)) continue;
    const stem = stemOf(name);
    if (!opts.componentExempt.includes(stem) && stem !== posix.basename(dir)) stems.add(stem);
  }
  for (const [old, now] of current) {
    const name = now.slice(dir.length + 1);
    if (!name.includes("/") && stems.has(stemOf(name)))
      current.set(old, `${dir}/${stemOf(name)}/${name}`);
  }
}

// Groups of unit names that share a prefix, biggest first. `prefix` are the segments the directory already implies.
function groupCandidates(units, prefix) {
  const groups = new Map();
  for (const name of units.keys()) {
    const segs = name.split("-");
    let i = 0;
    while (i < prefix.length && segs[i] === prefix[i]) i += 1;
    if (segs.length <= i + 1) continue;
    const consumed = segs.slice(0, i + 1);
    const id = consumed.join("-");
    const group = groups.get(id) ?? { key: segs[i], consumed, members: [] };
    group.members.push(name);
    groups.set(id, group);
  }
  return [...groups.values()]
    .filter((g) => g.members.length >= 2)
    .sort((a, b) => b.members.length - a.members.length || a.key.localeCompare(b.key));
}

function groupDirectory(current, dir, prefix, opts) {
  const units = unitsOf(current, dir);
  const used = new Set(units.keys());
  let count = units.size;
  const created = [];
  for (const group of groupCandidates(units, prefix)) {
    if (count <= opts.maxUnits) break;
    if (used.has(group.key)) continue; // a folder of that name would collide with an existing unit
    for (const name of group.members) {
      for (const [old, rel] of units.get(name)) current.set(old, `${dir}/${group.key}/${rel}`);
    }
    used.add(group.key);
    count -= group.members.length - 1;
    created.push(group);
  }
  for (const group of created) groupDirectory(current, `${dir}/${group.key}`, group.consumed, opts);
}

/**
 * @param {string[]} paths every repo-relative file path
 * @param {string} dir the directory to fix
 * @param {{ maxUnits: number, componentRoots: string[], componentExempt: string[], namedFiles?: string[], kebab?: boolean,
 *   into?: { folder: string, prefixes: string[] }[], auto?: boolean }} opts
 * @returns {Map<string, string>} old path -> new path, only for files that move
 */
export function planMoves(paths, dir, opts) {
  const current = new Map(paths.filter((p) => p.startsWith(`${dir}/`)).map((p) => [p, p]));
  if (opts.kebab) renameToKebab(current, dir, opts);
  componentFolders(current, dir, opts);
  moveInto(current, dir, opts.into ?? []);
  if (opts.auto !== false) groupDirectory(current, dir, [posix.basename(dir)], opts);
  return new Map([...current].filter(([old, now]) => old !== now));
}
