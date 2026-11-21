// The checkout of the servers on the e2e ports (US-DEV-08, issue 2390). Playwright reuses any server that already listens on
// its port, so a local run would report another checkout's code as its own. e2eServerGuard reads the ports of a run and
// refuses a listener that runs in another git checkout, or whose checkout is unknown, before Playwright decides about reuse.
// Used by app/packages/e2e/playwright.config.ts; the system calls are injectable (runCommand in clean-ports.mjs).
import { realpathSync } from "node:fs";
import { WORKTREE_ENV_FILE, e2ePorts } from "./dev-servers.mjs";
import { commandOf, listenersOf, ownerOf, runCommand } from "./clean-ports.mjs";

// The variables that point git at a repository. A git hook sets them, and they would name the hook's repository for every
// `git -C <dir>` below (run-gates.mjs says the same).
const GIT_LOCATION_VARIABLES = ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"];

/** The environment for a git question about a directory: this one without the repository variables of a hook. */
export function gitEnvironment(env = process.env) {
  return Object.fromEntries(
    Object.entries(env).filter(([name]) => !GIT_LOCATION_VARIABLES.includes(name)),
  );
}

/** The path with its links resolved; the path itself when it does not exist (a removed directory, a stub in a test). */
const realPathOr = (path) => {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
};

/**
 * The working directory of a process (US-DEV-08, issue 2390): /proc/<pid>/cwd on Linux, else the `n` line of
 * `lsof -d cwd` (macOS and BSD). undefined when neither tells it, for example for a process of another user.
 */
export function cwdOf(pid, run = runCommand, platform = process.platform) {
  if (platform === "linux") {
    const proc = run("readlink", [`/proc/${pid}/cwd`]);
    const path = proc.missing || proc.code !== 0 ? "" : proc.stdout.trim();
    if (path !== "") return path;
  }
  const lsof = run("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"]);
  if (lsof.missing || lsof.code !== 0) return undefined;
  const line = lsof.stdout.split("\n").find((l) => l.startsWith("n"));
  return line?.slice(1) || undefined;
}

/**
 * The checkout a directory belongs to: the real path of its git top level, or undefined outside a git checkout. The
 * repository variables of a hook are left out, so the answer is about the directory itself (issue 2390).
 */
export function checkoutOf(dir, run = runCommand) {
  const top = run("git", ["-C", dir, "rev-parse", "--show-toplevel"], gitEnvironment());
  if (top.missing || top.code !== 0 || top.stdout.trim() === "") return undefined;
  return realPathOr(top.stdout.trim());
}

/**
 * The listeners of a TCP port that do not belong to `checkout` (US-DEV-08, issue 2390): a server of another checkout, a
 * process whose working directory is unknown and a process outside any git checkout. Each entry names the pid, its
 * command, its working directory and its checkout (undefined when unknown). A process that has ended is no listener.
 */
export function foreignListeners(port, checkout, run = runCommand, platform = process.platform) {
  return listenersOf(port, run).flatMap((pid) => {
    if (ownerOf(pid, run) === null) return [];
    const cwd = cwdOf(pid, run, platform);
    const owner = cwd === undefined ? undefined : checkoutOf(cwd, run);
    if (owner !== undefined && owner === checkout) return [];
    return [{ pid, command: commandOf(pid, run), cwd, checkout: owner }];
  });
}

/**
 * Refuses a local run whose port a listener of another checkout holds, or a listener of unknown checkout (US-DEV-08, issue
 * 2390): Playwright would reuse that server and report its code as this checkout's. One error names every such listener:
 * the variable and the port, the pid, the other checkout and this checkout, and the two ways out.
 */
export function assertOwnServers({
  ports,
  checkout,
  run = runCommand,
  platform = process.platform,
}) {
  const lines = [];
  for (const { name, port } of ports) {
    for (const listener of foreignListeners(port, checkout, run, platform)) {
      const where =
        listener.checkout !== undefined
          ? `another checkout: ${listener.checkout}`
          : listener.cwd !== undefined
            ? `${listener.cwd}, which is no git checkout`
            : "an unknown checkout (its working directory cannot be read)";
      lines.push(`  ${name} ${port}: pid ${listener.pid} (${listener.command}) runs in ${where}`);
    }
  }
  if (lines.length === 0) return;
  throw new Error(
    [
      "e2e: a server of another checkout listens on a port of this run (US-DEV-08, issue 2390).",
      ...lines,
      `  this checkout: ${checkout}`,
      "A local run would reuse that server and report its code as this checkout's. Stop that process, or set E2E_WEB_PORT and E2E_API_PORT to ports that are free (in a worktree make sets them from .env.worktree).",
    ].join("\n"),
  );
}

/** The variable that the main process of a run sets after its owner check; the workers, which load the config again, skip it. */
export const E2E_CHECKED_VARIABLE = "PFLANZENDEX_E2E_SERVERS_CHECKED";

/**
 * The e2e ports of a Playwright run in the checkout `dir`, and the owner check of a local run (US-DEV-08, issue 2390).
 * Outside CI the check refuses a listener of another checkout on either port. In CI nothing is checked, no worktree file is
 * read, and the ports are the environment's or the defaults, as before. `checked` skips the check.
 */
export function e2eServerGuard({
  env = process.env,
  dir,
  file = WORKTREE_ENV_FILE,
  run = runCommand,
  platform = process.platform,
  checked = false,
}) {
  const ports = e2ePorts(env, env.CI ? null : file);
  if (env.CI || checked) return ports;
  const checkout = checkoutOf(dir, run) ?? realPathOr(dir);
  assertOwnServers({
    ports: [
      { name: "E2E_WEB_PORT", port: ports.web },
      { name: "E2E_API_PORT", port: ports.api },
    ],
    checkout,
    run,
    platform,
  });
  return ports;
}
