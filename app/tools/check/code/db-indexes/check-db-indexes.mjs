// QG gate (US-QG-07): every foreign key and every tenant column `account_id` is covered by an index.
//   node tools/check/code/db-indexes/check-db-indexes.mjs                  check against app/tools/check/code/db-indexes/findings-baseline.json
//   node tools/check/code/db-indexes/check-db-indexes.mjs --write-baseline create the baseline, or lower it; never enlarge it
// Why: a foreign key without an index makes every delete in the parent table scan the child table, and a tenant column
// without one makes every query of one account a full scan (P-04). Covered means: the leading column(s) of an index
// (not a partial one), a primary key or a unique constraint on the table are exactly the foreign key columns (any order),
// or for `account_id` the first column. Findings that exist today live in findings-baseline.json and only shrink.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { compareBaseline, toBaseline } from "./db-indexes-baseline.mjs";
import { replay } from "./db-indexes-schema.mjs";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
export const MIGRATIONS = path.join(app, "packages", "db", "migrations");
export const BASELINE_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "findings-baseline.json",
);
const devRef = process.env.DB_INDEXES_BASE ?? "origin/dev";

const sameSet = (a, b) => a.length === b.length && a.every((c) => b.includes(c));

/** Findings { table, target } for a replayed schema; `target` is "account_id" or "fk(col, col)". */
export function findMissingIndexes(tables) {
  const found = [];
  for (const [table, t] of tables) {
    const covering = [
      ...[...t.keys.values()].filter((k) => k.kind !== "fk"),
      ...[...t.indexes.values()].filter((i) => !i.partial),
    ];
    const covered = (cols) =>
      covering.some(
        (k) => sameSet(k.cols.slice(0, cols.length), cols) && k.cols.length >= cols.length,
      );
    if (t.columns.has("account_id") && !covering.some((k) => k.cols[0] === "account_id"))
      found.push({ table, target: "account_id" });
    for (const k of t.keys.values())
      if (k.kind === "fk" && !covered(k.cols))
        found.push({ table, target: `fk(${k.cols.join(", ")})` });
  }
  return found.filter(
    (f, i) => found.findIndex((g) => g.table === f.table && g.target === f.target) === i,
  );
}

export function scan(dir = MIGRATIONS) {
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  return findMissingIndexes(replay(files.map((f) => fs.readFileSync(path.join(dir, f), "utf8"))));
}

function devBaseline() {
  try {
    const root = path.resolve(app, "..");
    return JSON.parse(
      execFileSync(
        "git",
        ["show", `${devRef}:app/tools/check/code/db-indexes/findings-baseline.json`],
        {
          cwd: root,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        },
      ),
    );
  } catch {
    return undefined; // no ref, or dev has no baseline yet (first PR)
  }
}

/** The baseline, or undefined when the file does not exist yet. One read, no check-then-read race. */
function readBaseline() {
  try {
    return JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

function main(argv) {
  const findings = scan();
  const baseline = readBaseline();
  const exists = baseline !== undefined;
  if (argv.includes("--write-baseline")) {
    const keep = exists
      ? findings.filter((f) => baseline?.[f.table]?.includes(f.target))
      : findings;
    fs.writeFileSync(BASELINE_FILE, `${JSON.stringify(toBaseline(keep), null, 2)}\n`);
    console.log(`check-db-indexes: wrote ${keep.length} entries to ${BASELINE_FILE}`);
    return 0;
  }
  const errors = compareBaseline(findings, baseline ?? {}, exists ? devBaseline() : undefined);
  for (const e of errors) console.error(`check-db-indexes: ${e}`);
  if (errors.length) return 1;
  console.log(`check-db-indexes: ok (${findings.length} known findings in the baseline)`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  process.exit(main(process.argv.slice(2)));
