// layout-fix: brings one directory within the layout rules (US-QG-09, FR-QG-21).
//   node tools/layout-fix/layout-fix.mjs <dir> [--apply] [--kebab] [--into folder=name,prefix*]... [--no-auto]
//   node tools/layout-fix/layout-fix.mjs --move <from>=<to>... [--apply]      (move mode, FR-QG-23; `make layout-fix`)
//   Dry run unless --apply; <dir> is relative to the repo root. --kebab renames PascalCase and snake_case files,
//   --into folder=name,prefix* groups the named units (a trailing * means a prefix) into a folder (repeatable), --no-auto switches the grouping by
//   common name prefix off.
// Move mode moves the named files or directories (paths relative to the repo root) and rewrites the imports the same way.
// It plans the moves (fix-plan), moves with `git mv` and rewrites the imports that point at moved files (fix-rewrite).
// Imports are checked afterwards: each rewritten import must still resolve to the file it pointed at before.
// Other mentions of a moved path (a config string, a doc) are only reported; check them by hand and with the tests.
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import defaultConfig from "../../config/lint/layout.config.mjs";
import { listPaths } from "../check/code/layout/check-layout.mjs";
import { buildTree, matchDir, unitCount } from "../check/code/layout/layout-tree.mjs";
import { planMoves } from "./fix-plan.mjs";
import { applyMoves, broken, fixMoves, mentions, readAliases, rewriteAll } from "./fix-move.mjs";

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

// Unit limit of the directories that receive files in move mode.
const overLimitAt = (paths, moves, config) =>
  [...new Set([...moves.values()].map((n) => path.posix.dirname(n)))].flatMap((d) =>
    overLimit(paths, moves, d, config),
  );

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
  const opts = { apply: false, kebab: false, auto: true, into: [], move: [], dir: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--apply") opts.apply = true;
    else if (a === "--kebab") opts.kebab = true;
    else if (a === "--no-auto") opts.auto = false;
    else if (a === "--move") opts.move.push(argv[(i += 1)] ?? "");
    else if (a === "--into") {
      const [folder, list = ""] = (argv[(i += 1)] ?? "").split("=");
      opts.into.push({ folder, prefixes: list.split(",").filter(Boolean) });
    } else if (!a.startsWith("--")) opts.dir = a;
  }
  return opts;
}

function report(label, r, apply) {
  for (const [old, now] of r.moves) console.log(`  ${old} -> ${now}`);
  if (label) console.log(label);
  if (r.moves.size)
    console.log(
      `${r.moves.size} file(s) move, ${r.edits} import(s) in ${r.rewrittenFiles} file(s) are rewritten`,
    );
  for (const o of r.overLimit ?? [])
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

function main(argv) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const { dir: arg, apply, move, ...rest } = parseArgs(argv);
  if (move.length) {
    try {
      const r = fixMoves(root, move, { apply });
      r.overLimit = overLimitAt(listPaths(root), r.moves, defaultConfig);
      return report("", r, apply);
    } catch (e) {
      return console.error(`layout-fix: ${e.message}`) ?? 2;
    }
  }
  if (!arg)
    return (
      console.error(
        "usage: npm run layout-fix -- <dir> [--apply] [--kebab] [--into folder=name,prefix*] [--no-auto]\n       npm run layout-fix -- --move <from>=<to>... [--apply]",
      ) ?? 2
    );
  const dir = path.relative(root, path.resolve(root, arg)).split(path.sep).join("/");
  const r = fixDirectory(root, dir, { apply, ...rest });
  return report(
    `${dir}: ${r.before} units, ${r.moves.size ? `${r.after} after` : (r.note ?? "nothing to move")} (limit ${r.limit})`,
    r,
    apply,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exit(main(process.argv.slice(2)));
