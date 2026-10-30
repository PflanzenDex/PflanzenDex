// Pure helpers over repo-relative POSIX paths (US-QG-09, FR-QG-21). No file system access.

// kebab-case: lower-case letters and digits, separated by single dashes.
export const isKebab = (name) => name.split("-").every((part) => /^[a-z0-9]+$/.test(part));

// "card.test.tsx" -> "card": files of one unit share the name before the first dot.
export const stemOf = (name) => name.split(".")[0];

// Entries starting with "." (tooling folders, dotfiles) are not part of the layout.
export const isIgnored = (p) => p.split("/").some((s) => s.startsWith("."));

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
