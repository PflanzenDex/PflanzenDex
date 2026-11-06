// Per-worktree setup (US-DEV-08). `tools/repo/worktree-new.sh` runs both jobs for a new worktree.
// 1. Unique resources: port and database name are derived deterministically from the branch name, so parallel runs never
//    share a test database or a port. Usage: node worktree-env.mjs <branch>   -> prints KEY=VALUE lines (for .env.worktree).
//    `make dev` reads the file back (dev-servers.mjs, same folder).
// 2. Dependencies (#1487): a node_modules tree that was installed from the same package-lock.json is copied into the new worktree,
//    so the worktree is ready to commit in without a fresh install. A tree is a source only when its stamp matches its lock file
//    (check-deps.mjs: it passed `make setup`). The copy shares no file with the source: a reflink where the filesystem has one
//    (btrfs, xfs), a plain copy otherwise. Usage: node worktree-env.mjs --deps <app folder of the new worktree> [<app folder to prefer>]
//    Without a source nothing is copied, and `make setup` installs.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { depsFindings } from "../../check/supply/check-deps.mjs";

export const PORT_BASE = 54400; // assumption: range 54400-55899 is free; the fixed port 54329 stays with the main checkout
export const PORT_SLOTS = 500;

export function slug(branch) {
  return branch
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

export function worktreeEnv(branch) {
  if (!branch || !branch.trim()) throw new Error("branch name missing");
  const hash = createHash("sha256").update(branch).digest();
  const slot = hash.readUInt32BE(0) % PORT_SLOTS;
  return {
    PFLANZENDEX_TEST_DB_PORT: String(PORT_BASE + slot),
    PFLANZENDEX_TEST_DB_NAME: `pflanzendex_${slug(branch)}_${hash.toString("hex").slice(0, 6)}`,
    PFLANZENDEX_DEV_API_PORT: String(PORT_BASE + PORT_SLOTS + slot),
    PFLANZENDEX_DEV_WEB_PORT: String(PORT_BASE + 2 * PORT_SLOTS + slot),
  };
}

const exec = promisify(execFile);
const MB = 1024 * 1024;
const TOOL_CACHES = [".vite", ".vitest-cache"];

const lockOf = (app) => {
  const file = path.join(app, "package-lock.json");
  return existsSync(file) ? readFileSync(file) : null;
};

/** The node_modules folders of an install: the root, and each workspace the lock file gives its own (issue 1525). */
export function installFolders(app) {
  const nested = Object.keys(JSON.parse(lockOf(app)).packages ?? {}).flatMap(
    (key) => /^packages\/[^/]+\/node_modules(?=\/)/.exec(key) ?? [],
  );
  return ["node_modules", ...new Set(nested)];
}

/** The app folders whose installed tree can be copied for `target`: the same lock file bytes and a passing stamp. Order kept. */
export function sourcesFor(target, candidates) {
  const lock = lockOf(target);
  if (lock === null) return [];
  return candidates.filter((app) => {
    if (path.resolve(app) === path.resolve(target)) return false;
    if (!existsSync(path.join(app, "node_modules"))) return false;
    if (!lockOf(app)?.equals(lock)) return false;
    // A stamp says nothing about completeness: a tree without its workspace folders must not spread (issue 1525).
    if (!installFolders(app).every((folder) => existsSync(path.join(app, folder)))) return false;
    return depsFindings(app).length === 0;
  });
}

/**
 * Copies every node_modules folder of `<source>` to `<target>`. A copy that still links into the source is removed again and
 * refused: a shared link would make two worktrees write into the same files.
 */
export async function copyTree(source, target) {
  const folders = installFolders(source);
  try {
    for (const folder of folders) {
      const from = path.join(source, folder);
      const to = path.join(target, folder);
      const flags = process.platform === "linux" ? ["-a", "--reflink=auto"] : ["-a"];
      await exec("cp", [...flags, from, to], { maxBuffer: MB });
      // Test caches describe the source's files: a stale one fails tests in the new worktree (US-DEV-08).
      for (const cache of TOOL_CACHES)
        rmSync(path.join(to, cache), { recursive: true, force: true });
      const { stdout } = await exec("find", [to, "-type", "l", "-lname", `${source}/*`], {
        maxBuffer: MB,
      });
      if (stdout.trim()) {
        throw new Error(`a link in the copy points into ${source}: ${stdout.split("\n")[0]}`);
      }
    }
  } catch (e) {
    for (const folder of folders)
      rmSync(path.join(target, folder), { recursive: true, force: true });
    throw e;
  }
}

/** The app folders of every worktree of the repository of `target`, the preferred one first, duplicates out. */
export async function candidatesFor(target, prefer) {
  const { stdout } = await exec("git", ["-C", target, "worktree", "list", "--porcelain"], {
    maxBuffer: MB,
  });
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
    return { copied: false, reason: "no installed copy with the same package-lock.json" };
  }
  await copyTree(sources[0], target);
  return { copied: true, from: sources[0] };
}

async function depsMain(args) {
  const [target, prefer] = args;
  if (!target) {
    console.error(
      "usage: worktree-env.mjs --deps <app folder of the new worktree> [<preferred app folder>]",
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === "--deps") {
    await depsMain(process.argv.slice(3));
  } else {
    try {
      for (const [k, v] of Object.entries(worktreeEnv(process.argv[2]))) console.log(`${k}=${v}`);
    } catch (e) {
      console.error(`worktree-env: ${e.message}`);
      process.exit(1);
    }
  }
}
