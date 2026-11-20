import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isEntryPoint } from "../../check/shared/entry-point.mjs";
// Local-only guard of `make db-reset`, `make db-seed` and `make pokedex-build` (US-DEV-01). These targets change the test
// database of this worktree and nothing else, so they refuse: a PFLANZENDEX_ENV other than local or test, NODE_ENV
// production, a worktree database URL that is not on this machine, and a DATABASE_URL that is set to anything but that
// database (a staging URL left in the shell cannot reach a reset, a seed or a build).
// Also the removal of a merged branch's test database (US-DEV-08, issue 2325): `make merge` calls dropMergedTestDb after a
// squash merge. It runs `make db-down` in the linked worktree of the branch, and only when that worktree has its own test
// database (a port in its .env.worktree); the main checkout is never the target, because its db-down removes the shared one.
// Usage: node tools/workflow/worktree/local-database.mjs <worktree database URL>   (the Makefile passes $(PFLANZENDEX_TEST_DATABASE_URL))

export const LOCAL_ENVIRONMENTS = ["local", "test"];
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

// Host and database only: the password never reaches a message.
const describeUrl = (url) => `${url.hostname}:${url.port || 5432}${url.pathname}`;

function parseUrl(text, label) {
  try {
    return { url: new URL(text) };
  } catch {
    return { problem: `${label} cannot be parsed` };
  }
}

/** Why the local-only targets must not run in this environment, or `undefined` when they may. */
export function localDatabaseRefusal(env, worktreeUrl) {
  const name = env.PFLANZENDEX_ENV;
  if (name !== undefined && name !== "" && !LOCAL_ENVIRONMENTS.includes(name))
    return `PFLANZENDEX_ENV is '${name}'; the target runs only with local or test (or unset)`;
  if (env.NODE_ENV === "production")
    return "NODE_ENV is 'production'; the target never runs in production";

  const worktree = parseUrl(worktreeUrl, "the worktree's test database URL");
  if (worktree.problem) return worktree.problem;
  if (!LOOPBACK_HOSTS.has(worktree.url.hostname))
    return `the worktree's test database host '${worktree.url.hostname}' is not on this machine`;

  if (env.DATABASE_URL) {
    const given = parseUrl(env.DATABASE_URL, "DATABASE_URL");
    if (given.problem)
      return `${given.problem}; unset it: the target uses this worktree's test database`;
    if (!LOOPBACK_HOSTS.has(given.url.hostname))
      return `DATABASE_URL points to host '${given.url.hostname}', which is not on this machine; unset it: the target uses this worktree's test database`;
    if (env.DATABASE_URL !== worktreeUrl)
      return `DATABASE_URL is not this worktree's test database: it points to ${describeUrl(given.url)}, this worktree is ${describeUrl(worktree.url)}; unset it`;
  }
  return undefined;
}

/**
 * The worktree of `branch` (its branch ref in `git worktree list --porcelain`), or null (US-DEV-08). Git lists the main
 * checkout first: splitting at each `worktree ` line leaves the main checkout's block first, so it never counts, even when
 * it is on the branch.
 */
export function worktreeOf(porcelain, branch) {
  if (!branch) return null;
  const ref = `branch refs/heads/${branch}`;
  for (const block of porcelain.split(/^worktree /m).slice(2)) {
    const lines = block.split("\n");
    if (lines.includes(ref)) return lines[0];
  }
  return null;
}

/** The test database port that a worktree's .env.worktree sets, digits only as worktree-env.mjs writes it; else null. */
export function testDbPortOf(envText) {
  return /^PFLANZENDEX_TEST_DB_PORT=(\d+)[ \t]*$/m.exec(envText ?? "")?.[1] ?? null;
}

/** The text of a worktree's .env.worktree, or null when there is none or it cannot be read. */
function readEnvAt(dir) {
  try {
    return readFileSync(join(dir, ".env.worktree"), "utf8");
  } catch {
    return null;
  }
}

/** The worktree of `branch` whose own test database `make db-down` removes: its .env.worktree sets a port (US-DEV-08). */
export function testDbDirOf(porcelain, branch) {
  const dir = worktreeOf(porcelain, branch);
  return dir && testDbPortOf(readEnvAt(dir)) ? dir : null;
}

// The variables of an outer git hook (GIT_DIR in a pre-push run) would point a child git or make at another checkout.
const HOOK_GIT_VARS = new Set(["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"]);
const childEnv = () =>
  Object.fromEntries(Object.entries(process.env).filter(([name]) => !HOOK_GIT_VARS.has(name)));

/**
 * After a squash merge: `make db-down` in the merged branch's worktree (US-DEV-08, issue 2325). Returns the line to print,
 * or null when nothing ran cleanly. It never throws. db-down ignores a failing docker (the `-` prefix in the Makefile), so
 * the line says that make ran, not that a container was removed.
 */
export function dropMergedTestDb(branch, repoRoot) {
  if (!branch) return null;
  try {
    const listed = spawnSync("git", ["worktree", "list", "--porcelain"], {
      cwd: repoRoot,
      encoding: "utf8",
      env: childEnv(),
    });
    if (listed.status !== 0) return null;
    const dir = testDbDirOf(listed.stdout, branch);
    if (!dir) return null;
    const down = spawnSync("make", ["-C", dir, "db-down"], { stdio: "ignore", env: childEnv() });
    return !down.error && down.status === 0
      ? `merge-pr: removed the test database of ${dir} (make db-down)`
      : null;
  } catch {
    return null;
  }
}

if (isEntryPoint(import.meta.url)) {
  const reason = localDatabaseRefusal(process.env, process.argv[2] ?? "");
  if (reason) {
    console.error(`local-database: refused: ${reason}.`);
    process.exit(1);
  }
}
