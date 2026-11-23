// The browser of the UI gates (US-QG-01, issue 2429; ADR 0010): one-screen, a11y-routes and ui-gates run their Chromium in the
// pinned Playwright container, so the numbers do not depend on the browser of the machine. The API, the web preview, Keycloak
// and the database stay on the host. The container runs `playwright run-server` from the mounted node_modules (the same
// Playwright as the tests, so client and server never differ); the tests connect to it, and `exposeNetwork` lets the browser
// reach the loopback ports of the host (localhost:<web port>, localhost:<api port>, Keycloak).
// Usage (the npm scripts of packages/e2e do this): node dev-servers.gate-browser.mjs -- <command> [args]
// `--image` only pulls the pinned image when it is missing (make gate-browser-image). The command runs with PW_GATE_WS set to
// the WebSocket address of the container. UI_GATES_HOST=1 runs the command without the container, with the host Chromium:
// informational only, never the gate. The container is removed when the command ends, also on a failure or a Ctrl-C.
// GATE_BROWSER_READY_S (seconds, default 60) bounds the start. The container helpers are in dev-servers.gate-browser.container.mjs.
import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";
import { isEntryPoint } from "../../check/shared/entry-point.mjs";
import {
  appRoot,
  containerName,
  ensureImage,
  findFreePort,
  gateBrowserRunArgs,
  gateBrowserWsEndpoint,
  gateState,
  hostMode,
  installedVersion,
  isBindRace,
  pinnedImage,
  readyTimeoutS,
  removeContainer,
  removeName,
  removeStale,
  waitListening,
} from "./dev-servers.gate-browser.container.mjs";

export {
  gateBrowserRunArgs,
  gateBrowserWsEndpoint,
  hostMode,
  pinnedImage,
} from "./dev-servers.gate-browser.container.mjs";

const STOP_GRACE_MS = 5000;

// Runs the command; a Ctrl-C or a kill stops it first (SIGTERM, then SIGKILL after a grace period). Gives its exit code.
function runChild(command, env, state) {
  return new Promise((resolveRun) => {
    const child = spawn(command[0], command.slice(1), { env, stdio: "inherit" });
    state.child = child;
    child.on("error", (error) => {
      console.error(`gate browser: ${command[0]}: ${error.message}`);
      resolveRun(127);
    });
    child.on("close", (code) => resolveRun(code ?? 1));
  });
}

function stopChild(state) {
  const child = state.child;
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  const force = setTimeout(() => child.kill("SIGKILL"), STOP_GRACE_MS);
  force.unref();
}

// Ctrl-C and kill: the run stops and the container goes with it; the main flow then removes the container and exits.
function onSignal(state, signal) {
  if (state.stopping) return;
  state.stopping = true;
  console.error(`gate browser: ${signal} received, stopping the run and the container`);
  stopChild(state);
}

// One start of the container on a port: `{ started }`, or the docker message and whether it was the loopback bind race.
function startContainer(docker, state, image, port) {
  const run = spawnSync(
    docker,
    gateBrowserRunArgs({
      name: state.name,
      image,
      port,
      nodeModules: join(appRoot, "node_modules"),
      label: appRoot,
    }),
    { encoding: "utf8" },
  );
  if (run.status === 0) {
    state.started = true;
    return { started: true };
  }
  const message = (run.stderr || run.error?.message || "no output").trim();
  return { started: false, bindRace: isBindRace(message), message };
}

async function runInContainer(command, docker, env) {
  const image = pinnedImage(installedVersion());
  const state = gateState(containerName(process.pid));
  const signals = ["SIGINT", "SIGTERM", "SIGHUP"];
  const handlers = signals.map((s) => [s, () => onSignal(state, s)]);
  for (const [s, h] of handlers) process.on(s, h);
  // Last resort on any exit path (an unexpected throw, process.exit elsewhere): the container is removed synchronously.
  const onExit = () => removeContainer(docker, state);
  process.on("exit", onExit);
  try {
    ensureImage(docker, image);
    removeStale(docker, appRoot);
    let port = await findFreePort();
    let began = Date.now();
    let start = startContainer(docker, state, image, port);
    if (!start.started && start.bindRace) {
      // The port was free when it was read and taken before docker published it: one retry on a new port (review of 3f030cae).
      // The failed start leaves its name reserved, so the name is freed first.
      console.error(
        `gate browser: port ${port} was taken before the container published it, starting again on a new port`,
      );
      removeName(docker, state.name);
      port = await findFreePort();
      began = Date.now();
      start = startContainer(docker, state, image, port);
    }
    if (!start.started) throw new Error(`the gate browser could not start: ${start.message}`);
    await waitListening(docker, state, began + readyTimeoutS(env) * 1000);
    const ws = gateBrowserWsEndpoint(port);
    const seconds = ((Date.now() - began) / 1000).toFixed(1);
    console.error(`gate browser: ${image} listens on ${ws} after ${seconds} s (the gate)`);
    if (state.stopping) return 130;
    const code = await runChild(command, { ...env, PW_GATE_WS: ws }, state);
    return state.stopping ? 130 : code;
  } catch (error) {
    console.error(`gate browser: ${error.message}`);
    return state.stopping ? 130 : 1;
  } finally {
    removeContainer(docker, state);
    for (const [s, h] of handlers) process.off(s, h);
    process.off("exit", onExit);
  }
}

/** The command after `--` (or the whole argument list when there is no `--`). */
function commandOf(argv) {
  const dashes = argv.indexOf("--");
  return dashes >= 0 ? argv.slice(dashes + 1) : argv;
}

export async function main(argv, env = process.env, docker = "docker") {
  // `make gate-browser-image`: the pinned image is pulled ahead of the gate, next to the seed under `make -j` (issue 2429).
  if (argv[0] === "--image") {
    try {
      ensureImage(docker, pinnedImage(installedVersion()));
      return 0;
    } catch (error) {
      console.error(`gate browser: ${error.message}`);
      return 1;
    }
  }
  const command = commandOf(argv);
  if (command.length === 0) {
    console.error("usage: dev-servers.gate-browser.mjs -- <command> [args]");
    return 2;
  }
  if (hostMode(env)) {
    console.error(
      "gate browser: UI_GATES_HOST=1, the host Chromium runs this gate: informational, not the gate (US-QG-01).",
    );
    const hostEnv = { ...env };
    delete hostEnv["PW_GATE_WS"];
    return runChild(command, hostEnv, gateState("host"));
  }
  return runInContainer(command, docker, env);
}

if (isEntryPoint(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
