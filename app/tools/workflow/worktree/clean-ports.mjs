// `make clean-ports` (US-DEV-01): stops the processes that listen on the dev ports of this worktree (API and web, from
// .env.worktree; 3000 and 5173 in the main checkout). A process is found by its port only, and only processes of the
// current user are stopped; each stop is named in the output. Another user's listener is reported and left alone.
// Usage: node tools/workflow/worktree/clean-ports.mjs   (from app/, as `make clean-ports` runs it)
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { WORKTREE_ENV_FILE, worktreePorts } from "./dev-servers.mjs";

// The defaults of the main checkout: `PORT` of the API (main.ts) and the Vite dev server's default port.
export const MAIN_CHECKOUT_PORTS = { api: 3000, web: 5173 };

/** The API and web ports of this worktree, or the main checkout's defaults when there is no `.env.worktree`. */
export function devPorts(file = WORKTREE_ENV_FILE) {
  const ports = worktreePorts(file) ?? MAIN_CHECKOUT_PORTS;
  return { api: ports.api, web: ports.web };
}

/** Runs a system tool; `missing` when it is not installed. Arguments go without a shell. */
export function runCommand(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  if (r.error?.code === "ENOENT") return { missing: true };
  if (r.error) throw r.error;
  return { code: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

const unique = (pids) => [...new Set(pids)];

/** The pids of `lsof -t` output: one per line. */
export function parseLsof(text) {
  return unique(
    text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /^\d+$/.test(line))
      .map(Number),
  );
}

/** The pids of `ss -ltnp` output: every `pid=<n>` of the listener lines. */
export function parseSs(text) {
  return unique([...text.matchAll(/pid=(\d+)/g)].map((m) => Number(m[1])));
}

/** The pids that listen on the TCP port. lsof exits 1 with no output when nothing matches; ss is the fallback on Linux. */
export function listenersOf(port, run = runCommand) {
  const lsof = run("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"]);
  if (!lsof.missing) {
    const none = lsof.code === 1 && lsof.stdout.trim() === "" && lsof.stderr.trim() === "";
    if (lsof.code === 0 || none) return parseLsof(lsof.stdout);
    throw new Error(`lsof failed on port ${port}: ${lsof.stderr.trim() || `exit ${lsof.code}`}`);
  }
  const ss = run("ss", ["-H", "-ltnp", `sport = :${port}`]);
  if (ss.missing)
    throw new Error("neither lsof nor ss is installed: cannot find the processes on the port");
  if (ss.code !== 0)
    throw new Error(`ss failed on port ${port}: ${ss.stderr.trim() || `exit ${ss.code}`}`);
  return parseSs(ss.stdout);
}

/** The uid of a process, `null` when it has ended. */
export function ownerOf(pid, run = runCommand) {
  const r = run("ps", ["-o", "uid=", "-p", String(pid)]);
  if (r.missing) throw new Error("ps is not installed");
  if (r.code !== 0 || r.stdout.trim() === "") return null;
  return Number(r.stdout.trim());
}

/** The command line of a process, for the output only. */
export function commandOf(pid, run = runCommand) {
  const r = run("ps", ["-o", "args=", "-p", String(pid)]);
  return r.missing || r.code !== 0 ? "unknown" : r.stdout.trim() || "unknown";
}

const realKill = (pid, signal) => {
  try {
    process.kill(pid, signal);
  } catch (error) {
    if (error.code !== "ESRCH") throw error; // it ended in the meantime
  }
};
const realSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The port counts as free when the process no longer listens on it: a zombie that has closed its socket is free too.
async function waitFreed(pid, port, ms, options) {
  for (let waited = 0; ; waited += options.pollMs) {
    if (!listenersOf(port, options.run).includes(pid)) return true;
    if (waited >= ms) return false;
    await options.sleep(options.pollMs);
  }
}

async function stopProcess(pid, port, options) {
  options.kill(pid, "SIGTERM");
  if (await waitFreed(pid, port, options.graceMs, options)) return true;
  options.kill(pid, "SIGKILL");
  return waitFreed(pid, port, 1000, options);
}

/**
 * Frees the ports: stops the own listeners and reports the others. `ok` is false when a port stays busy (another user's
 * process, or one that did not stop), so the run never reports a port free that is not (P-10).
 */
export async function cleanPorts({
  ports,
  uid = process.getuid(),
  run = runCommand,
  kill = realKill,
  sleep = realSleep,
  log = console.log,
  graceMs = 3000,
  pollMs = 100,
}) {
  const options = { run, kill, sleep, graceMs, pollMs };
  const result = { ok: true, stopped: [], skipped: [] };
  for (const { name, port } of ports) {
    const pids = listenersOf(port, run);
    if (pids.length === 0) {
      log(`clean-ports: nothing listens on ${name} port ${port}`);
      continue;
    }
    for (const pid of pids) {
      const owner = ownerOf(pid, run);
      if (owner === null) continue; // ended in the meantime
      const command = commandOf(pid, run);
      if (owner !== uid) {
        result.ok = false;
        result.skipped.push({ pid, port, name, owner, command });
        log(`clean-ports: skipped ${pid} (${command}): owner uid ${owner}, not this user`);
        continue;
      }
      if (await stopProcess(pid, port, options)) {
        result.stopped.push({ pid, port, name, command });
        log(`clean-ports: stopped ${pid} (${command}) listening on ${name} port ${port}`);
      } else {
        result.ok = false;
        log(`clean-ports: ${pid} (${command}) still listens on ${name} port ${port} after SIGKILL`);
      }
    }
    const skipped = result.skipped.filter((s) => s.port === port).map((s) => s.pid);
    const busy = listenersOf(port, run).filter((pid) => !skipped.includes(pid));
    if (busy.length) {
      result.ok = false;
      log(`clean-ports: ${name} port ${port} is still in use by pid ${busy.join(", ")}`);
    }
  }
  return result;
}

async function main() {
  const ports = devPorts();
  const source = existsSync(WORKTREE_ENV_FILE) ? ".env.worktree" : "the main checkout defaults";
  console.log(`clean-ports: dev ports API ${ports.api}, web ${ports.web} (${source})`);
  const result = await cleanPorts({
    ports: [
      { name: "API", port: ports.api },
      { name: "web", port: ports.web },
    ],
  });
  console.log(
    result.ok
      ? `clean-ports: done, ${result.stopped.length} process(es) stopped`
      : "clean-ports: a port stays busy, see the lines above; stop that process by hand",
  );
  return result.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error(`clean-ports: ${error.message}`);
      process.exit(1);
    });
}
