// Resolves and rebuilds import specifiers for layout-fix (US-QG-09). Pure: works on a set of repo-relative paths.
// Handles the forms this repo uses: relative without extension, directories (index files), exact names such as
// stylesheets, and an alias like "@/" that is valid inside one package.
import path from "node:path";

const posix = path.posix;
const EXTS = [".ts", ".tsx", ".mts", ".mjs", ".js", ".json"];

const candidates = (base) => [
  [base, "exact"],
  ...EXTS.map((e) => [base + e, "ext"]),
  ...EXTS.map((e) => [`${base}/index${e}`, "index"]),
];

/** @returns {{ target: string, how: "exact" | "ext" | "index" } | null} null for packages and unknown targets. */
export function resolveSpecifier(spec, from, ctx) {
  let base;
  if (spec.startsWith(".")) {
    base = posix.normalize(posix.join(posix.dirname(from), spec));
  } else {
    const alias = ctx.aliases.find((a) => spec.startsWith(a.prefix) && from.startsWith(a.scope));
    if (!alias) return null;
    base = posix.join(alias.dir, spec.slice(alias.prefix.length));
  }
  for (const [file, how] of candidates(base)) if (ctx.files.has(file)) return { target: file, how };
  return null;
}

const withoutExt = (p) => p.replace(/\.[^./]+$/, "");

/** The specifier for `to.target` as seen from `to.from` (both after the move), in the style of the original `spec`. */
export function buildSpecifier(spec, res, to, ctx) {
  const { from: newFrom, target: newTarget } = to;
  let named = newTarget;
  if (res.how === "ext") named = withoutExt(newTarget);
  if (res.how === "index") {
    named = posix.basename(newTarget).startsWith("index.")
      ? posix.dirname(newTarget)
      : withoutExt(newTarget);
  }
  if (!spec.startsWith(".")) {
    const alias = ctx.aliases.find((a) => spec.startsWith(a.prefix));
    return alias.prefix + posix.relative(alias.dir, named);
  }
  const rel = posix.relative(posix.dirname(newFrom), named);
  if (rel === "") return ".";
  return rel.startsWith(".") ? rel : `./${rel}`;
}
