// layout-fix: brings one directory within the layout rules (US-QG-09, FR-QG-21).
//   node tools/layout-fix/layout-fix.mjs <dir> [--apply] [--kebab] [--into folder=name,prefix*]... [--no-auto]
//   Dry run unless --apply; <dir> is relative to the repo root. --kebab renames PascalCase and snake_case files,
//   --into folder=name,prefix* groups the named units (a trailing * means a prefix) into a folder (repeatable), --no-auto switches the grouping by
//   common name prefix off.
// It plans the moves (fix-plan), moves with `git mv` and rewrites the imports that point at moved files (fix-rewrite).
// Imports are checked afterwards: each rewritten import must still resolve to the file it pointed at before.
// Other mentions of a moved path (a config string, a doc) are only reported; check them by hand and with the tests.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import defaultConfig from "../../layout.config.mjs";
import { listPaths } from "../check/code/layout/check-layout.mjs";
import { buildTree, matchDir, unitCount } from "../check/code/layout/layout-tree.mjs";
import { planMoves } from "./fix-plan.mjs";
import { resolveSpecifier } from "./fix-resolve.mjs";
import { rewriteImports } from "./fix-rewrite.mjs";

const CODE = /\.(?:tsx?|mts|mjs|cjs|js)$/;
const TEXT = /\.(?:tsx?|mts|mjs|cjs|js|json|md|ya?ml|sh|css|html)$/;
const read = (root, file) => fs.readFileSync(path.join(root, file), "utf8");

// "@/*": ["./src/*"] in app/packages/<pkg>/tsconfig.json -> alias "@/" valid inside that package
function readAliases(files, root) {
  return files
    .filter((f) => /^app\/packages\/[^/]+\/tsconfig\.json$/.test(f))
    .flatMap((f) => {
      const m = /"@\/\*"\s*:\s*\[\s*"\.\/([^"*]+?)\/\*"/.exec(read(root, f));
      const pkg = path.posix.dirname(f);
      return m ? [{ prefix: "@/", dir: `${pkg}/${m[1]}`, scope: `${pkg}/` }] : [];
    });
}

function rewriteAll(root, moves, ctx) {
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
function broken(edits, moves, ctx) {
  const after = {
    files: new Set([...ctx.files].map((f) => moves.get(f) ?? f)),
    aliases: ctx.aliases,
  };
  return edits.filter((e) => resolveSpecifier(e.next, e.now, after)?.target !== e.target);
}

// Files that contain the old path of a moved file (imports have no extension, so these are strings such as configs).
function mentions(root, files, moves) {
  const needles = [...moves.keys()].map((old) => [old, old.replace(/^app\/packages\/[^/]+\//, "")]);
  const found = [];
  for (const file of files.filter((f) => TEXT.test(f))) {
    const text = read(root, file);
    for (const [old, needle] of needles) if (text.includes(needle)) found.push({ file, path: old });
  }
  return found;
}

function applyMoves(root, moves, texts) {
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

// Directories that the moves touch and that would still be over their unit limit (a new folder can be too big itself).
function overLimit(paths, moves, dir, config) {
  const touched = new Set([dir]);
  for (const now of moves.values()) {
    for (let d = path.posix.dirname(now); d.startsWith(`${dir}/`); d = path.posix.dirname(d))
      touched.add(d);
  }
  const tree = buildTree(paths.map((p) => moves.get(p) ?? p));
  const found = [];
  for (const d of [...touched].sort()) {
    const rule = config.dirs.find((r) => matchDir(r.path, d));
    const units = unitCount(tree.get(d) ?? new Map());
    if (!rule?.collection && units > (rule?.maxUnits ?? config.maxUnits))
      found.push({ dir: d, units });
  }
  return found;
}

const unitsIn = (paths, dir) => unitCount(buildTree(paths).get(dir) ?? new Map());

/** Plans, and with `apply` performs, the moves for one directory. Returns the report. */
export function fixDirectory(root, dir, options = {}) {
  const { apply = false, config = defaultConfig, kebab = false, into = [], auto = true } = options;
  const paths = listPaths(root);
  const rule = config.dirs.find((r) => matchDir(r.path, dir));
  const limit = rule?.maxUnits ?? config.maxUnits;
  const before = unitsIn(paths, dir);
  const empty = {
    moves: new Map(),
    rewrittenFiles: 0,
    edits: 0,
    broken: [],
    mentions: [],
    before,
    after: before,
    limit,
  };
  if (rule?.collection) return { ...empty, note: "a collection has no unit limit" };
  const moves = planMoves(paths, dir, { ...config, maxUnits: limit, kebab, into, auto });
  if (moves.size === 0)
    return {
      ...empty,
      note: before > limit ? "no group of units shares a name prefix" : "within the limit",
    };
  const ctx = { files: new Set(paths), aliases: readAliases(paths, root) };
  const { texts, edits } = rewriteAll(root, moves, ctx);
  const report = {
    ...empty,
    moves,
    rewrittenFiles: texts.size,
    edits: edits.length,
    broken: broken(edits, moves, ctx),
    mentions: mentions(root, paths, moves),
    overLimit: overLimit(paths, moves, dir, config),
    after: unitsIn(
      paths.map((p) => moves.get(p) ?? p),
      dir,
    ),
  };
  if (apply && report.broken.length === 0) applyMoves(root, moves, texts);
  return report;
}

// --into folder=prefix,prefix (repeatable); the other flags have no value
function parseArgs(argv) {
  const opts = { apply: false, kebab: false, auto: true, into: [], dir: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--apply") opts.apply = true;
    else if (a === "--kebab") opts.kebab = true;
    else if (a === "--no-auto") opts.auto = false;
    else if (a === "--into") {
      const [folder, list = ""] = (argv[(i += 1)] ?? "").split("=");
      opts.into.push({ folder, prefixes: list.split(",").filter(Boolean) });
    } else if (!a.startsWith("--")) opts.dir = a;
  }
  return opts;
}

function main(argv) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const { dir: arg, apply, ...rest } = parseArgs(argv);
  if (!arg)
    return (
      console.error(
        "usage: npm run layout-fix -- <dir> [--apply] [--kebab] [--into folder=name,prefix*] [--no-auto]",
      ) ?? 2
    );
  const dir = path.relative(root, path.resolve(root, arg)).split(path.sep).join("/");
  const r = fixDirectory(root, dir, { apply, ...rest });
  for (const [old, now] of r.moves) console.log(`  ${old} -> ${now}`);
  console.log(
    `${dir}: ${r.before} units, ${r.moves.size ? `${r.after} after` : (r.note ?? "nothing to move")} (limit ${r.limit})`,
  );
  if (r.moves.size)
    console.log(
      `${r.moves.size} file(s) move, ${r.edits} import(s) in ${r.rewrittenFiles} file(s) are rewritten`,
    );
  for (const o of r.overLimit)
    console.log(
      `  still over the limit: ${o.dir} has ${o.units} units; split it with --into folder=name,prefix*`,
    );
  for (const m of r.mentions) console.log(`  check by hand: ${m.file} mentions ${m.path}`);
  for (const b of r.broken)
    console.error(
      `  BROKEN: ${b.now}: "${b.next}" does not resolve to ${b.target}; nothing was changed`,
    );
  if (r.moves.size && !apply) console.log("dry run: add --apply to move the files");
  return r.broken.length ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exit(main(process.argv.slice(2)));
