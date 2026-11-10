// Per-worktree setup (US-DEV-08). `tools/repo/worktree-new.sh` runs both jobs for a new worktree.
// 1. Unique resources: port and database name are derived from the branch name (the slot is its hash, or the next free slot
//    when another worktree holds it, issue 1745). Usage: node worktree-env.mjs <branch> -> KEY=VALUE lines (for .env.worktree);
//    `make dev` reads the file back (dev-servers.mjs, same folder).
// 2. Dependencies (#1487): a node_modules tree that was installed from the same package-lock.json is copied into the new worktree,
//    so the worktree is ready to commit in without a fresh install. A tree is a source only when its stamp matches its lock file
//    (check-deps.mjs: it passed `make setup`). The copy shares no file with the source: a reflink where the filesystem has one
//    (btrfs, xfs), a plain copy otherwise. Usage: node worktree-env.mjs --deps <app folder of the new worktree> [<app folder to prefer>]
//    Without a source nothing is copied, and `make setup` installs.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, rmSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { depsFindings } from "../../check/supply/check-deps.mjs";

// Port blocks (US-DEV-08): one block of PORT_SLOTS per service, and all ports of a worktree share its slot. The e2e ports
// have blocks of their own, apart from the dev servers, so a gate never reuses a running `make dev` server (issue 1745).
// Test database 54400-54899, dev API 54900-55399, dev web 55400-55899, e2e API 55900-56399, e2e web 56400-56899.
export const PORT_BASE = 54400; // assumption: range 54400-56899 is free; the fixed port 54329 stays with the main checkout
export const PORT_SLOTS = 500;

export function slug(branch) {
  return branch
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

/**
 * The ports and the database name of a branch. `usedSlots` holds the slots of the other worktrees (takenSlots reads them):
 * the slot is the first one from the hash on that is not held, wrapping past the last one (issue 1745).
 */
export function worktreeEnv(branch, usedSlots = new Set()) {
  if (!branch || !branch.trim()) throw new Error("branch name missing");
  const hash = createHash("sha256").update(branch).digest();
  const slot = [...Array(PORT_SLOTS).keys()]
    .map((i) => (hash.readUInt32BE(0) + i) % PORT_SLOTS)
    .find((s) => !usedSlots.has(s));
  if (slot === undefined) throw new Error(`all ${PORT_SLOTS} port slots are held by worktrees`);
  return {
    PFLANZENDEX_TEST_DB_PORT: String(PORT_BASE + slot),
    PFLANZENDEX_TEST_DB_NAME: `pflanzendex_${slug(branch)}_${hash.toString("hex").slice(0, 6)}`,
    PFLANZENDEX_DEV_API_PORT: String(PORT_BASE + PORT_SLOTS + slot),
    PFLANZENDEX_DEV_WEB_PORT: String(PORT_BASE + 2 * PORT_SLOTS + slot),
    PFLANZENDEX_E2E_API_PORT: String(PORT_BASE + 3 * PORT_SLOTS + slot),
    PFLANZENDEX_E2E_WEB_PORT: String(PORT_BASE + 4 * PORT_SLOTS + slot),
  };
}

/** The slot a `.env.worktree` text holds, read from its test database port; undefined when it has none in the range. */
export function slotOf(envText) {
  const match = /^PFLANZENDEX_TEST_DB_PORT=(\d+)[ \t]*$/m.exec(envText);
  if (!match) return undefined;
  const slot = Number(match[1]) - PORT_BASE;
  return slot >= 0 && slot < PORT_SLOTS ? slot : undefined;
}

/** The slots of the other worktrees of the repository of `root`, from their `.env.worktree`; `root` itself is left out. */
export async function takenSlots(root) {
  const { stdout } = await exec("git", ["-C", root, "worktree", "list", "--porcelain"]);
  const self = realpathSync(root);
  const slots = new Set();
  for (const line of stdout.split("\n").filter((l) => l.startsWith("worktree "))) {
    const dir = line.slice("worktree ".length);
    const file = path.join(dir, ".env.worktree");
    if (!existsSync(file) || realpathSync(dir) === self) continue;
    const slot = slotOf(readFileSync(file, "utf8"));
    if (slot !== undefined) slots.add(slot);
  }
  return slots;
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
      // The worktrees of this checkout hold the slots that this branch must not take (issue 1745).
      const taken = await takenSlots(fileURLToPath(new URL("../../../../", import.meta.url)));
      for (const [k, v] of Object.entries(worktreeEnv(process.argv[2], taken)))
        console.log(`${k}=${v}`);
    } catch (e) {
      console.error(`worktree-env: ${e.message}`);
      process.exit(1);
    }
  }
}
