// Rules LY-1 to LY-5 and LY-7 over a path list (FR-QG-21, d-136, d-138). Pure: the README.md texts of the manifests are read
// through readText. judgeLayout returns the findings { rule, dir, value, items } (they fail the gate) and the hints (they
// are printed and never fail); findLayout returns the findings only.
import { isManifestPath, parseManifest } from "./layout-manifest.mjs";
import {
  buildTree,
  familyOf,
  globMatch,
  isIgnored,
  isKebab,
  matchDir,
  prefixProposal,
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
const dirOf = (p) => p.split("/").slice(0, -1).join("/");

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

// Automatic collection (FR-QG-21, d-133, d-135): a directory without a per-path rule that holds `autoCollectionMin` files of
// one extension family. Its files have no unit limit and LY-3 still applies to them; its subfolders still count as units
// against the size hint and the failing limit (d-135), so 8 files with 9 subfolders print the hint.
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

// The units of a directory that LY-1 counts (FR-QG-21, d-133, d-135).
function unitsOf(dir, children, rule, config) {
  const counted = isAutoCollection(rule, children, config) ? subfoldersOnly(children) : children;
  return unitCount(new Map([...counted].filter(isCounted(dir, rule, config))));
}

// A hard LY-1 limit: a per-path rule (d-133) or the expect of a valid manifest (d-136). It wins over the size hint.
function hardLimit(rule, manifest) {
  if (rule?.maxUnits !== undefined) return { limit: rule.maxUnits, source: "per-path rule" };
  if (manifest?.state === "ok") return { limit: manifest.expect, source: "manifest" };
  return undefined;
}

const failingLimit = (config) => config.failUnits ?? 2 * config.maxUnits;

// LY-1 (FR-QG-21, d-136, d-138): a folder fails above its hard limit; without one, only above the failing limit (twice the
// size hint). Between the size hint and that limit the folder only gets a hint (see hintFor).
function fanoutFindings(dir, units, hard, config) {
  const limit = hard?.limit ?? failingLimit(config);
  if (units <= limit) return [];
  const why = !hard
    ? `limit ${limit} (twice the size hint)`
    : `${hard.source === "manifest" ? "expect" : "limit"} ${limit} (${hard.source})`;
  return [{ rule: "LY-1", dir: dir || ".", value: units, items: [`${units} units, ${why}`] }];
}

// The size hint (FR-QG-21, d-136): a folder with no hard limit that holds more units than maxUnits, and no more than the
// failing limit, gets a hint. It names the longest shared file prefix as a subfolder proposal (LY-1b).
function hintFor(dir, files, units, config) {
  return { dir: dir || ".", units, size: config.maxUnits, prefix: prefixProposal(files) };
}

// LY-2 to LY-3 and the LY-1 judgement of one directory, with its hint.
function judgeDir(dir, children, manifest, config) {
  const rule = config.dirs.find((r) => matchDir(r.path, dir));
  const out = { findings: dir === "" ? rootFindings(children, config) : [] };
  if (rule?.collection) {
    const bad = [...children.keys()].filter((n) => !rule.collection.test(n));
    if (bad.length) out.findings.push(finding("LY-2", dir, bad));
    return out;
  }
  const units = unitsOf(dir, children, rule, config);
  const hard = hardLimit(rule, manifest);
  out.findings.push(...fanoutFindings(dir, units, hard, config));
  if (!hard && units > config.maxUnits && units <= failingLimit(config)) {
    const files = [...children].filter(([, kind]) => kind === "file").map(([name]) => name);
    out.hint = hintFor(dir, files, units, config);
  }
  const badNames = [...children]
    .filter(([n, k]) => !nameOk(n, k, config) && !(k === "file" && nameExempt(dir, n, config)))
    .map(([n]) => n);
  if (badNames.length) out.findings.push(finding("LY-3", dir, badNames));
  return out;
}

// LY-4: a component x.tsx lives in a directory x/. A collection directory (a per-path rule with `collection`, LY-2) is
// exempt: its name pattern is its rule, and the flat primitives of src/shared/ui (the shadcn layout, R3, d-133, issue 2509)
// are component files there.
function componentFindings(paths, config) {
  const byDir = new Map();
  const isCollection = (dir) =>
    config.dirs.find((r) => matchDir(r.path, dir))?.collection !== undefined;
  for (const p of paths) {
    const parts = p.split("/");
    const name = parts.at(-1);
    const dir = parts.slice(0, -1).join("/");
    if (!config.componentRoots.some((r) => dir === r || dir.startsWith(`${r}/`))) continue;
    if (isCollection(dir)) continue;
    if (!name.endsWith(".tsx") || isTestOrStory(name)) continue;
    if (config.componentExempt.includes(stemOf(name))) continue;
    if (parts.at(-2) === stemOf(name)) continue;
    byDir.set(dir, [...(byDir.get(dir) ?? []), name]);
  }
  return [...byDir].map(([dir, items]) => finding("LY-4", dir, items));
}

// The manifests of the folders (LY-1a, LY-7): the README.md of each folder that has frontmatter, by folder.
function manifestsOf(paths, readText) {
  const out = new Map();
  for (const p of paths.filter(isManifestPath)) {
    const text = readText(p);
    if (text === undefined) continue;
    const manifest = parseManifest(text);
    if (manifest.state !== "none") out.set(dirOf(p), { ...manifest, path: p });
  }
  return out;
}

// LY-7: a malformed manifest fails and names the path and the missing or invalid key (d-136).
function manifestFindings(manifests) {
  return [...manifests].flatMap(([dir, m]) =>
    m.state === "bad"
      ? [
          finding(
            "LY-7",
            dir,
            m.problems.map((problem) => `${m.path}: ${problem}`),
          ),
        ]
      : [],
  );
}

export function judgeLayout(allPaths, config, readText = () => undefined) {
  const paths = allPaths.filter((p) => !isIgnored(p));
  const manifests = manifestsOf(paths, readText);
  const findings = [];
  const hints = [];
  for (const [dir, children] of buildTree(paths)) {
    const judged = judgeDir(dir, children, manifests.get(dir), config);
    findings.push(...judged.findings);
    if (judged.hint) hints.push(judged.hint);
  }
  findings.push(...manifestFindings(manifests), ...componentFindings(paths, config));
  return { findings, hints };
}

export function findLayout(allPaths, config, readText) {
  return judgeLayout(allPaths, config, readText).findings;
}

// The lines of one hint (printed by check-layout, which adds its name): the size hint, the subfolder proposal and the
// manifest hint, in this order (LY-1b).
export function hintLines({ dir, units, size, prefix }) {
  const lines = [`hint ${dir}: ${units} units, size hint ${size}, no failure`];
  if (prefix) {
    const folder = prefix.name.slice(0, -1);
    lines.push(
      `  ${prefix.files} files start with ${prefix.name}: a subfolder ${folder}/ is a proposal`,
    );
  }
  lines.push("  or write a manifest: README.md frontmatter with topic, why and expect (FR-QG-21)");
  return lines;
}
