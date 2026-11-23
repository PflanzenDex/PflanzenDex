// The container of the UI gates' browser (US-QG-01, issue 2429; ADR 0010): the pinned Playwright image, the `docker` calls that
// start, wait for and remove it, and the pure helpers of its run arguments. dev-servers.gate-browser.mjs runs the command.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const LABEL = "pflanzendex.gate-browser";
const NAME_PREFIX = "pflanzendex-gate-browser-";
const READY_TEXT = "Listening on";
const DEFAULT_READY_S = 60;

/** The pinned image of the installed Playwright, as ds-snapshots derives it (the same browser build, the same fonts). */
export function pinnedImage(version) {
  return `mcr.microsoft.com/playwright:v${version}-noble`;
}

/** Only UI_GATES_HOST=1 runs the host browser, so a stray value never turns the gate informational. */
export const hostMode = (env) => env["UI_GATES_HOST"] === "1";

/** The WebSocket address of the container's run-server, reached on the loopback of this machine. */
export const gateBrowserWsEndpoint = (port) => `ws://127.0.0.1:${port}/`;

/** The name of the container of one run: the process id keeps two runs apart. */
export const containerName = (pid) => `${NAME_PREFIX}${pid}`;

/**
 * The `docker run` arguments: detached, published to the loopback only, the Playwright of node_modules. No `--rm`: a container
 * that dies keeps its logs for the failure message, and the wrapper removes it by name (removeContainer, removeStale).
 */
export function gateBrowserRunArgs({ name, image, port, nodeModules, label }) {
  return [
    "run",
    "-d",
    "--init",
    "--ipc=host",
    "--name",
    name,
    "--label",
    `${LABEL}=${label}`,
    "-p",
    `127.0.0.1:${port}:${port}`,
    "-v",
    `${nodeModules}:/work/node_modules:ro`,
    "-e",
    "HOME=/tmp",
    image,
    "node",
    "/work/node_modules/playwright/cli.js",
    "run-server",
    "--host",
    "0.0.0.0",
    "--port",
    String(port),
  ];
}

/** The version of the Playwright in app/node_modules: the image is derived from it. */
export const installedVersion = () =>
  JSON.parse(readFileSync(join(appRoot, "node_modules", "playwright", "package.json"), "utf8"))
    .version;

/** A free port of the loopback, read before the container starts (the run-server publishes it). */
export function findFreePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolvePort(port));
    });
  });
}

/** GATE_BROWSER_READY_S: whole seconds the container has to report its listener (default 60). */
export function readyTimeoutS(env) {
  const raw = env["GATE_BROWSER_READY_S"] ?? String(DEFAULT_READY_S);
  if (!/^\d+$/.test(raw) || Number(raw) < 1)
    throw new Error(`GATE_BROWSER_READY_S must be a whole number of seconds, got '${raw}'`);
  return Number(raw);
}

// Every step of a container run is recorded here, so the stop can tell what it has to remove (P-10: nothing silently).
export function gateState(name) {
  return { name, started: false, stopping: false, child: null };
}

export function removeContainer(docker, state) {
  if (!state.started) return;
  state.started = false;
  const r = spawnSync(docker, ["rm", "-f", state.name], { encoding: "utf8" });
  if (r.status !== 0)
    console.error(`gate browser: could not remove ${state.name}: ${(r.stderr ?? "").trim()}`);
}

/** The pinned image is present, or it is pulled now (its time is logged: the cost of a first run). */
export function ensureImage(docker, image) {
  if (spawnSync(docker, ["image", "inspect", image]).status === 0) return;
  const began = Date.now();
  const pulled = spawnSync(docker, ["pull", image], { stdio: "inherit" });
  if (pulled.status !== 0) throw new Error(`the pinned image ${image} could not be pulled`);
  console.error(`gate browser: pulled ${image} in ${Math.round((Date.now() - began) / 1000)} s`);
}

// The label value of a checkout: the sweep and the containers of one worktree never touch another worktree's containers.
export const ownerLabel = (root) => `${LABEL}=${root}`;

// Containers of earlier runs of THIS checkout that a crash left behind (filtered on its label value); the heavy lock keeps one
// gate run at a time on this machine.
export function removeStale(docker, root = appRoot) {
  const ps = spawnSync(docker, ["ps", "-aq", "--filter", `label=${ownerLabel(root)}`], {
    encoding: "utf8",
  });
  const ids = (ps.stdout ?? "")
    .split("\n")
    .map((id) => id.trim())
    .filter(Boolean);
  if (ids.length > 0) spawnSync(docker, ["rm", "-f", ...ids]);
}

// docker's text when the host port of the publish was taken between the free-port check and the start (a loopback race).
const BIND_RACE = /failed to bind host port|address already in use/;
export const isBindRace = (message) => BIND_RACE.test(message);

/** Removes a container by name, even one a failed start left behind with its name reserved. */
export function removeName(docker, name) {
  spawnSync(docker, ["rm", "-f", name], { encoding: "utf8" });
}

/** Resolves when the container logs its listener; throws when it stopped or was removed, a stop was asked or the deadline passed. */
export async function waitListening(docker, state, deadline) {
  for (;;) {
    const logs = spawnSync(docker, ["logs", state.name], { encoding: "utf8" });
    const text = `${logs.stdout ?? ""}${logs.stderr ?? ""}`;
    if (text.includes(READY_TEXT)) return;
    // A container that exited (false) or was removed (inspect fails) will not report a listener: fail at once with its logs.
    const running = spawnSync(docker, ["inspect", "-f", "{{.State.Running}}", state.name], {
      encoding: "utf8",
    });
    const exited = running.status !== 0 || running.stdout?.trim() === "false";
    if (exited || state.stopping || Date.now() > deadline)
      throw new Error(
        `the gate browser did not start (${state.name}${exited ? ", it stopped or was removed" : ""}): ${text.trim().slice(-400) || "no output"}`,
      );
    await new Promise((resolveWait) => setTimeout(resolveWait, 200));
  }
}
