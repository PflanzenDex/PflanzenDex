// Local-only guard of `make db-reset`, `make db-seed` and `make pokedex-build` (US-DEV-01). These targets change the test
// database of this worktree and nothing else, so they refuse: a PFLANZENDEX_ENV other than local or test, NODE_ENV
// production, a worktree database URL that is not on this machine, and a DATABASE_URL that is set to anything but that
// database (a staging URL left in the shell cannot reach a reset, a seed or a build).
// Usage: node tools/workflow/worktree/local-database.mjs <worktree database URL>   (the Makefile passes $(PFLANZENDEX_TEST_DATABASE_URL))
import { fileURLToPath } from "node:url";

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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const reason = localDatabaseRefusal(process.env, process.argv[2] ?? "");
  if (reason) {
    console.error(`local-database: refused: ${reason}.`);
    process.exit(1);
  }
}
