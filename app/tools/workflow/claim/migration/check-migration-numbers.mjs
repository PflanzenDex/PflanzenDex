// Gate (issue #831): no two migrations share a number, and a migration that is new compared with origin/dev
// has a number above the highest one there. Merge origin/dev first; on a collision run `make migration` again
// for the new file (rename it, do not touch applied migrations).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { migrationsAt } from "./git-view.mjs";
import { findProblems, MIGRATIONS_DIR, numberOf } from "./migration-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const baseRef = process.env.MIGRATION_BASE ?? "origin/dev";

function devFiles() {
  const have = () => migrationsAt(baseRef, root);
  const files = have();
  if (files) return files;
  try {
    // Shallow CI checkouts have no origin/dev: fetch just that tip.
    execFileSync(
      "git",
      ["fetch", "--quiet", "--depth=1", "origin", `dev:refs/remotes/${baseRef}`],
      {
        cwd: root,
        stdio: "ignore",
      },
    );
  } catch {
    /* reported below */
  }
  return have();
}

function main() {
  const files = fs
    .readdirSync(path.join(root, MIGRATIONS_DIR))
    .filter((f) => numberOf(f) !== undefined);
  const dev = devFiles();
  if (!dev)
    console.warn(`check-migration-numbers: ${baseRef} not available, only duplicates are checked`);
  const problems = findProblems({ files, devFiles: dev });
  for (const p of problems) console.error(`check-migration-numbers: ${p}`);
  if (problems.length) return 1;
  console.log(`check-migration-numbers: ok (${files.length} migrations)`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exit(main());
