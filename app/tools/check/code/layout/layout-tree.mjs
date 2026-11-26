// Pure helpers over repo-relative POSIX paths (US-QG-09, FR-QG-21). No file system access.

// kebab-case: lower-case letters and digits, separated by single dashes.
export const isKebab = (name) => name.split("-").every((part) => /^[a-z0-9]+$/.test(part));

// "card.test.tsx" -> "card": files of one unit share the name before the first dot.
export const stemOf = (name) => name.split(".")[0];

// Entries starting with "." (tooling folders, dotfiles) are not part of the layout.
export const isIgnored = (p) => p.split("/").some((s) => s.startsWith("."));

// The extension family of a file (FR-QG-21, d-133): its last extension, where .ts and .tsx are one family and .js, .jsx
// and .mjs are one family. undefined for a file without an extension.
const FAMILY_OF = new Map([
  ["ts", "ts"],
  ["tsx", "ts"],
  ["js", "js"],
  ["jsx", "js"],
  ["mjs", "js"],
]);
export function familyOf(name) {
  const ext = name.includes(".") ? name.split(".").at(-1) : "";
  return ext === "" ? undefined : (FAMILY_OF.get(ext) ?? ext);
}

// Map<dir, Map<name, "file" | "dir">>; the root directory is "".
export function buildTree(paths) {
  const tree = new Map([["", new Map()]]);
  for (const p of paths) {
    const parts = p.split("/");
    parts.forEach((name, i) => {
      const dir = parts.slice(0, i).join("/");
      const isFile = i === parts.length - 1;
      if (!tree.has(dir)) tree.set(dir, new Map());
      tree.get(dir).set(name, isFile ? "file" : "dir");
      if (!isFile) {
        const child = parts.slice(0, i + 1).join("/");
        if (!tree.has(child)) tree.set(child, new Map());
      }
    });
  }
  return tree;
}

// A unit is a directory or a group of files with the same stem (LY-1).
export function unitCount(children) {
  return new Set([...children].map(([name, kind]) => (kind === "dir" ? name : stemOf(name)))).size;
}

// The subfolder hint (LY-1b, d-136): a name prefix that this many files share is proposed as a subfolder.
export const SUBFOLDER_MIN_FILES = 3;

// The prefixes of one file name: its leading kebab-case segments, each with a dash, shorter than the stem.
// plant-layer-sheet.tsx gives plant- and plant-layer-.
const prefixesOf = (name) => {
  const stem = stemOf(name);
  if (!isKebab(stem)) return [];
  const segments = stem.split("-");
  return segments.slice(0, -1).map((_, i) => `${segments.slice(0, i + 1).join("-")}-`);
};

// The longest prefix that SUBFOLDER_MIN_FILES or more files of one directory share (LY-1b), with its file count; ties go
// to the more shared prefix, then to the name. Undefined when no prefix is shared by enough files. Files count, not units.
export function prefixProposal(fileNames) {
  const counts = new Map();
  for (const name of fileNames)
    for (const prefix of prefixesOf(name)) counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
  const shared = [...counts].filter(([, files]) => files >= SUBFOLDER_MIN_FILES);
  if (shared.length === 0) return undefined;
  shared.sort(([a, fa], [b, fb]) => b.length - a.length || fb - fa || a.localeCompare(b));
  const [name, files] = shared[0];
  return { name, files };
}

// "*" matches exactly one path segment.
export function matchDir(pattern, dir) {
  const a = pattern.split("/");
  const b = dir.split("/");
  return a.length === b.length && a.every((s, i) => s === "*" || s === b[i]);
}

// Glob over whole paths: "**" matches zero or more segments, "*" any part of one segment. Segment-wise, so no
// pattern becomes a regular expression.
export function globMatch(pattern, path) {
  return matchSegments(pattern.split("/"), path.split("/"));
}

function matchSegments(pattern, parts) {
  if (pattern.length === 0) return parts.length === 0;
  if (pattern[0] === "**")
    return (
      matchSegments(pattern.slice(1), parts) ||
      (parts.length > 0 && matchSegments(pattern, parts.slice(1)))
    );
  if (parts.length === 0) return false;
  return matchPart(pattern[0], parts[0]) && matchSegments(pattern.slice(1), parts.slice(1));
}

// One segment against a pattern with "*": the literal pieces must occur in order, the first at the start, the last at the end.
function matchPart(pattern, name) {
  const pieces = pattern.split("*");
  if (pieces.length === 1) return pattern === name;
  if (!name.startsWith(pieces[0])) return false;
  let rest = name.slice(pieces[0].length);
  for (const middle of pieces.slice(1, -1)) {
    const at = rest.indexOf(middle);
    if (at < 0) return false;
    rest = rest.slice(at + middle.length);
  }
  return rest.endsWith(pieces.at(-1));
}
