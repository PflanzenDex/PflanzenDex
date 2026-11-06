// Dependencies for a new worktree (US-DEV-08, #1487): a node_modules tree that was installed from the same package-lock.json is
// copied into it, so `make worktree` leaves a worktree that is ready to commit in, without a fresh install. A tree is a source
// only when its stamp matches its lock file (check-deps.mjs: it passed `make setup`). The copy shares no file with the source: a
// reflink where the filesystem has one (btrfs, xfs), a plain copy otherwise. Without a source nothing is copied and `make setup`
// installs. Usage: node deps-reuse.mjs <app folder of the new worktree> [<app folder to prefer as source>]
import { execFile } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { depsFindings } from "../../app/tools/check/supply/check-deps.mjs";

const exec = promisify(execFile);
const MB = 1024 * 1024;

const lockOf = (app) => {
  const file = path.join(app, "package-lock.json");
  return existsSync(file) ? readFileSync(file) : null;
};

/** The app folders whose installed tree can be copied for `target`: the same lock file bytes and a passing stamp. Order kept. */
export function sourcesFor(target, candidates) {
  const lock = lockOf(target);
  if (lock === null) return [];
  return candidates.filter((app) => {
    if (path.resolve(app) === path.resolve(target)) return false;
    if (!existsSync(path.join(app, "node_modules"))) return false;
    if (!lockOf(app)?.equals(lock)) return false;
    return depsFindings(app).length === 0;
  });
}

/**
 * Copies `<source>/node_modules` to `<target>/node_modules`. A copy that still links into the source is removed again and
 * refused: a shared link would make two worktrees write into the same files.
 */
export async function copyTree(source, target) {
  const from = path.join(source, "node_modules");
  const to = path.join(target, "node_modules");
  const args =
    process.platform === "linux"
      ? ["-a", "--reflink=auto", from, to]
      : ["-a", from, to];
  try {
    await exec("cp", args, { maxBuffer: MB });
    const { stdout } = await exec(
      "find",
      [to, "-type", "l", "-lname", `${from}/*`],
      {
        maxBuffer: MB,
      },
    );
    if (stdout.trim()) {
      throw new Error(
        `a link in the copy points into ${from}: ${stdout.split("\n")[0]}`,
      );
    }
  } catch (e) {
    rmSync(to, { recursive: true, force: true });
    throw e;
  }
}

/** The app folders of every worktree of the repository of `target`, the preferred one first, duplicates out. */
export async function candidatesFor(target, prefer) {
  const { stdout } = await exec(
    "git",
    ["-C", target, "worktree", "list", "--porcelain"],
    {
      maxBuffer: MB,
    },
  );
  const apps = stdout
    .split("\n")
    .filter((line) => line.startsWith("worktree "))
    .map((line) => path.join(line.slice("worktree ".length), "app"));
  return [...new Set([...(prefer ? [prefer] : []), ...apps])];
}

/** Copies the first source for `target` when `target` has no node_modules yet. Returns what happened, for the log. */
export async function reuseDeps({ target, prefer }) {
  if (existsSync(path.join(target, "node_modules"))) {
    return { copied: false, reason: "node_modules is already there" };
  }
  const sources = sourcesFor(target, await candidatesFor(target, prefer));
  if (sources.length === 0) {
    return {
      copied: false,
      reason: "no installed copy with the same package-lock.json",
    };
  }
  await copyTree(sources[0], target);
  return { copied: true, from: sources[0] };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [target, prefer] = process.argv.slice(2);
  if (!target) {
    console.error(
      "usage: deps-reuse.mjs <app folder of the new worktree> [<preferred app folder>]",
    );
    process.exit(2);
  }
  try {
    const result = await reuseDeps({
      target: path.resolve(target),
      prefer: prefer ? path.resolve(prefer) : undefined,
    });
    console.log(
      result.copied
        ? `deps: copied from ${result.from} (own copy, nothing shared; make setup checks the stamp)`
        : `deps: not copied (${result.reason}); make setup installs them`,
    );
  } catch (e) {
    console.error(`deps: not copied (${e.message}); make setup installs them`);
    process.exit(1);
  }
}
