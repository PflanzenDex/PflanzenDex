// Removes the test database containers of worktrees that no longer exist (US-DEV-08, issue 2396). `make db-prune` runs it in
// app/; the repository is the one that git finds from there. A test database container is named pflanzendex-test-db (the
// main checkout, always kept) or pflanzendex-test-db-<port> (a worktree with its own port, worktree-env.mjs). db-up labels each
// new container with the path of its worktree (pflanzendex.worktree=<path>); a container from before the label is matched by
// its port against the .env.worktree of the live worktrees. Rules (decide): a labelled container is kept when its worktree is
// live (on disk and listed by git worktree list), else removed; an unlabelled pflanzendex-test-db-<port> is kept when a live
// worktree has that port, else removed; any other name is kept, because the tool does not touch what it does not understand.
// A removal is `docker rm -f -v <name>`. DRY_RUN (any non-empty value; the Makefile passes it as DRY_RUN=1) only prints.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { isEntryPoint } from "../../check/shared/entry-point.mjs";
import { testDbPortOf } from "./local-database.mjs";

export const MAIN_CONTAINER = "pflanzendex-test-db";
export const LABEL = "pflanzendex.worktree";
const PORT_CONTAINER = /^pflanzendex-test-db-(\d+)$/;
const LIST_FORMAT = `{{.Names}}\\t{{.Label "${LABEL}"}}`;

/** The lines of `docker ps --format` (name, TAB, label) as containers; an unlabelled container has an empty label. */
export function parseContainers(text) {
  return text
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => {
      const [name, label = ""] = line.split("\t");
      return { name, label };
    });
}

/** The worktree paths of `git worktree list --porcelain`, in the order git lists them (the main checkout first). */
export function parseWorktrees(porcelain) {
  return porcelain
    .split("\n")
    .filter((line) => line.startsWith("worktree "))
    .map((line) => line.slice("worktree ".length));
}

/**
 * The live worktrees: the listed paths that exist on disk, each with the test database port of its .env.worktree (null when
 * it has none). Only that port is taken from the file; its other lines never leave this function.
 */
export function liveWorktrees({ paths, exists, readEnv }) {
  return paths.filter((p) => exists(p)).map((p) => ({ path: p, port: testDbPortOf(readEnv(p)) }));
}

/**
 * The decision per container, in the order given: `{ name, action: "keep" | "remove", reason }` (US-DEV-08). `worktrees` are
 * the live ones (liveWorktrees). Paths are compared as given, so the caller passes them in one form.
 */
export function decide({ containers, worktrees }) {
  const livePaths = new Set(worktrees.map((w) => w.path));
  const portOwner = new Map();
  for (const w of worktrees)
    if (w.port !== null && !portOwner.has(w.port)) portOwner.set(w.port, w.path);
  return containers.map(({ name, label }) => {
    if (name === MAIN_CONTAINER)
      return { name, action: "keep", reason: "the main checkout's test database is always kept" };
    const port = PORT_CONTAINER.exec(name)?.[1];
    if (port === undefined)
      return { name, action: "keep", reason: "not a test database name of this tool; left alone" };
    if (label !== "") {
      return livePaths.has(label)
        ? { name, action: "keep", reason: `its worktree ${label} is live` }
        : {
            name,
            action: "remove",
            reason: `its worktree ${label} is no longer a live worktree`,
          };
    }
    const owner = portOwner.get(port);
    return owner === undefined
      ? { name, action: "remove", reason: `no live worktree uses port ${port} (no label)` }
      : { name, action: "keep", reason: `port ${port} is the port of the live worktree ${owner}` };
  });
}

const firstLine = (error) => String(error.message).split("\n")[0];

/**
 * Lists the containers and the worktrees, decides, and removes what no live worktree owns (or, with dryRun, only says so).
 * `docker(args)` and `git(args)` return stdout and throw when the command fails; `fs` holds canonical, exists and readEnv.
 * Returns the exit code: 0 when every removal worked, 1 when one failed (each failure goes to `err`, never silently).
 */
export function prune({ dryRun, docker, git, fs, log, err }) {
  const containers = parseContainers(
    docker(["ps", "-a", "--filter", `name=${MAIN_CONTAINER}`, "--format", LIST_FORMAT]),
  ).map(({ name, label }) => ({ name, label: label === "" ? "" : fs.canonical(label) }));
  const paths = parseWorktrees(git(["worktree", "list", "--porcelain"])).map((p) =>
    fs.canonical(p),
  );
  const worktrees = liveWorktrees({ paths, exists: fs.exists, readEnv: fs.readEnv });
  const decided = decide({ containers, worktrees });
  if (decided.length === 0) log("db-prune: no test database containers");
  let failed = 0;
  for (const { name, action, reason } of decided) {
    if (action === "keep") {
      log(`kept ${name}: ${reason}`);
    } else if (dryRun) {
      log(`would remove ${name}: ${reason}`);
    } else {
      try {
        docker(["rm", "-f", "-v", name]);
        log(`removed ${name}: ${reason}`);
      } catch (error) {
        failed += 1;
        err(`not removed ${name}: ${firstLine(error)}`);
      }
    }
  }
  return failed === 0 ? 0 : 1;
}

// The git variables of an outer git hook would point a child git at another checkout (as in local-database.mjs).
const childEnv = () =>
  Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")));

// The real docker and git: a failed command throws with its first error line.
function runCommand(command) {
  return (args) => {
    const result = spawnSync(command, args, { encoding: "utf8", env: childEnv() });
    if (result.error) throw result.error;
    if (result.status !== 0)
      throw new Error(
        (result.stderr || `${command} ${args[0]} exited with ${result.status}`).trim(),
      );
    return result.stdout;
  };
}

// The real file system: a path is taken in its canonical form (a symlinked folder compares equal to its target), and the
// .env.worktree of a worktree is read only for its port (liveWorktrees). A file that exists but cannot be read throws.
const realFs = {
  canonical: (p) => (existsSync(p) ? realpathSync(p) : p),
  exists: (p) => existsSync(p),
  readEnv: (dir) => {
    const file = path.join(dir, ".env.worktree");
    return existsSync(file) ? readFileSync(file, "utf8") : null;
  },
};

if (isEntryPoint(import.meta.url)) {
  try {
    process.exitCode = prune({
      dryRun: Boolean(process.env.DRY_RUN),
      docker: runCommand("docker"),
      git: runCommand("git"),
      fs: realFs,
      log: (line) => console.log(line),
      err: (line) => console.error(line),
    });
  } catch (error) {
    console.error(`db-prune: ${firstLine(error)}`);
    process.exitCode = 1;
  }
}
