// Shared by both modes of layout-fix (US-QG-09, FR-QG-23): rewriting imports for a set of moves, checking them, applying them,
// and the explicit move mode `--move <from>=<to>` that plans the moves from file or directory pairs.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { listPaths } from "../check/code/layout/check-layout.mjs";
import { resolveSpecifier } from "./fix-resolve.mjs";
import { rewriteImports } from "./fix-rewrite.mjs";

const CODE = /\.(?:tsx?|mts|mjs|cjs|js)$/;
const TEXT = /\.(?:tsx?|mts|mjs|cjs|js|json|md|ya?ml|sh|css|html)$/;
const read = (root, file) => fs.readFileSync(path.join(root, file), "utf8");

// "@/*": ["./src/*"] in app/packages/<pkg>/tsconfig.json -> alias "@/" valid inside that package
export function readAliases(files, root) {
  return files
    .filter((f) => /^app\/packages\/[^/]+\/tsconfig\.json$/.test(f))
    .flatMap((f) => {
      const m = /"@\/\*"\s*:\s*\[\s*"\.\/([^"*]+?)\/\*"/.exec(read(root, f));
      const pkg = path.posix.dirname(f);
      return m ? [{ prefix: "@/", dir: `${pkg}/${m[1]}`, scope: `${pkg}/` }] : [];
    });
}

export function rewriteAll(root, moves, ctx) {
  const texts = new Map();
  const edits = [];
  for (const old of [...ctx.files].filter((f) => CODE.test(f))) {
    const now = moves.get(old) ?? old;
    const out = rewriteImports(read(root, old), { old, now }, moves, ctx);
    if (out.count === 0) continue;
    texts.set(now, out.text);
    edits.push(...out.edits.map((e) => ({ ...e, now })));
  }
  return { texts, edits };
}

// Rewritten imports that no longer resolve to the file they pointed at.
export function broken(edits, moves, ctx) {
  const after = {
    files: new Set([...ctx.files].map((f) => moves.get(f) ?? f)),
    aliases: ctx.aliases,
  };
  return edits.filter((e) => resolveSpecifier(e.next, e.now, after)?.target !== e.target);
}

// Files that contain the old path of a moved file (imports have no extension, so these are strings such as configs).
export function mentions(root, files, moves) {
  const needles = [...moves.keys()].map((old) => [old, old.replace(/^app\/packages\/[^/]+\//, "")]);
  const found = [];
  for (const file of files.filter((f) => TEXT.test(f))) {
    const text = read(root, file);
    for (const [old, needle] of needles) if (text.includes(needle)) found.push({ file, path: old });
  }
  return found;
}

export function applyMoves(root, moves, texts) {
  for (const [old, now] of moves) {
    fs.mkdirSync(path.dirname(path.join(root, now)), { recursive: true });
    try {
      execFileSync("git", ["mv", old, now], { cwd: root, stdio: "ignore" });
    } catch {
      fs.renameSync(path.join(root, old), path.join(root, now)); // not tracked yet
    }
  }
  for (const [file, text] of texts) fs.writeFileSync(path.join(root, file), text);
}

/**
 * Expands `from=to` pairs (repo-relative; a file or a directory) to the old -> new path of every tracked file.
 * Throws on a missing source, a target that exists or is claimed twice, and a directory moved into itself.
 */
export function planExplicitMoves(paths, specs) {
  const moves = new Map();
  const taken = new Set(paths);
  const norm = (p) => path.posix.normalize(p).replace(/\/$/, "");
  for (const spec of specs) {
    const [rawFrom, rawTo] = spec.split("=");
    if (!rawFrom || !rawTo) throw new Error(`--move needs <from>=<to>, got "${spec}"`);
    const [from, to] = [norm(rawFrom), norm(rawTo)];
    if (to.startsWith(`${from}/`)) throw new Error(`cannot move ${from} into itself (${to})`);
    const hit = paths.filter((p) => p === from || p.startsWith(`${from}/`));
    if (hit.length === 0)
      throw new Error(`nothing to move: ${from} is not a tracked file or directory`);
    for (const old of hit) {
      const now = to + old.slice(from.length);
      if (taken.has(now) && !moves.has(now)) throw new Error(`${now} already exists`);
      if ([...moves.values()].includes(now)) throw new Error(`two moves lead to ${now}`);
      moves.set(old, now);
    }
  }
  return moves;
}

/** Plans, and with `apply` performs, the explicit moves; the report has the shape of fixDirectory (plus `overLimit` input). */
export function fixMoves(root, specs, { apply = false } = {}) {
  const paths = listPaths(root);
  const moves = planExplicitMoves(paths, specs);
  const ctx = { files: new Set(paths), aliases: readAliases(paths, root) };
  const { texts, edits } = rewriteAll(root, moves, ctx);
  const report = {
    moves,
    rewrittenFiles: texts.size,
    edits: edits.length,
    broken: broken(edits, moves, ctx),
    mentions: mentions(root, paths, moves),
  };
  if (apply && report.broken.length === 0) applyMoves(root, moves, texts);
  return report;
}
