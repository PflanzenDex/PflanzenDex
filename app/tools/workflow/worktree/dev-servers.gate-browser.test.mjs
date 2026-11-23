// Tests of the gate browser (US-QG-01, issue 2429): the browser of one-screen, a11y-routes and ui-gates runs in the pinned
// Playwright container (ADR 0010), the API, web preview, Keycloak and database stay on the host. The container is started
// and removed by dev-servers.gate-browser.mjs; these tests put a fake `docker` first on PATH, so no container starts here.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, describe, test } from "node:test";
import {
  gateBrowserRunArgs,
  gateBrowserWsEndpoint,
  hostMode,
  pinnedImage,
} from "./dev-servers.gate-browser.mjs";
import { appRoot as gateAppRoot, removeStale } from "./dev-servers.gate-browser.container.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const appRoot = join(here, "../../..");
const WRAPPER = join(here, "dev-servers.gate-browser.mjs");
const INSTALLED = JSON.parse(
  readFileSync(join(appRoot, "node_modules", "playwright", "package.json"), "utf8"),
).version;

// Each call is logged; the answers are set by environment variables (see the tests below). FAKE_BIND_FAIL=once makes the first
// start lose its port (docker's bind race), always makes every start do so; FAKE_INSPECT=false|gone is a container that
// stopped or was removed; FAKE_LOG_TEXT is what a failing container logged.
const FAKE_DOCKER = `#!/bin/sh
echo "$*" >> "$FAKE_DOCKER_LOG"
case "$1" in
  image) [ -n "$FAKE_IMAGE_PRESENT" ] && exit 0; exit 1 ;;
  pull) echo "pulled $2"; exit 0 ;;
  ps) [ -n "$FAKE_STALE" ] && echo "$FAKE_STALE"; exit 0 ;;
  run)
    if [ "$FAKE_BIND_FAIL" = always ] || { [ "$FAKE_BIND_FAIL" = once ] && [ ! -e "$FAKE_DOCKER_LOG.bound" ]; }; then
      touch "$FAKE_DOCKER_LOG.bound"
      echo "driver failed programming external connectivity: failed to bind host port 127.0.0.1:1/tcp: address already in use" >&2
      exit 1
    fi
    [ -n "$FAKE_RUN_FAIL" ] && { echo "no docker here" >&2; exit 1; }; echo "fake-container"; exit 0 ;;
  logs)
    if [ -n "$FAKE_NO_LISTEN" ]; then [ -n "$FAKE_LOG_TEXT" ] && echo "$FAKE_LOG_TEXT"; else echo "Listening on ws://0.0.0.0:1/"; fi
    exit 0 ;;
  inspect)
    case "$FAKE_INSPECT" in
      false) echo false; exit 0 ;;
      gone) echo "Error: No such object" >&2; exit 1 ;;
      *) echo true; exit 0 ;;
    esac ;;
  *) exit 0 ;;
esac
`;

// A docker that answers `ps` with a label filter like docker does: `label=<key>=<value>` matches that value only, a bare
// `label=<key>` matches every container with the key. FAKE_TABLE holds "<name> <owner>" lines.
const TABLE_DOCKER = `#!/bin/sh
echo "$*" >> "$FAKE_DOCKER_LOG"
case "$1" in
  ps)
    want=""
    for a in "$@"; do
      case "$a" in
        label=pflanzendex.gate-browser=*) want="\${a#label=pflanzendex.gate-browser=}" ;;
        label=pflanzendex.gate-browser) want="*" ;;
      esac
    done
    while read -r name owner; do
      [ -n "$name" ] || continue
      if [ "$want" = "*" ] || [ "$owner" = "$want" ]; then echo "$name"; fi
    done < "$FAKE_TABLE"
    exit 0 ;;
  *) exit 0 ;;
esac
`;

const sandboxes = [];
after(() => {
  for (const dir of sandboxes) rmSync(dir, { recursive: true, force: true });
});

function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), "gate-browser-"));
  sandboxes.push(dir);
  const bin = join(dir, "bin");
  mkdirSync(bin);
  writeFileSync(join(bin, "docker"), FAKE_DOCKER, { mode: 0o755 });
  return { dir, log: join(dir, "docker.log"), probe: join(dir, "probe.txt"), bin };
}

const calls = (sb) => (existsSync(sb.log) ? readFileSync(sb.log, "utf8").trim().split("\n") : []);

// The wrapper with a command after `--`. The environment starts without the gate variables, so a shell cannot leak one in.
const runWrapper = (sb, command, env = {}) => runWrapperArgs(sb, ["--", ...command], env);

function runWrapperArgs(sb, args, env = {}) {
  const gateKeys = ["UI_GATES_HOST", "GATE_BROWSER_READY_S", "PW_GATE_WS"];
  const inherited = { ...process.env, PATH: sb.bin + delimiter + process.env["PATH"] };
  const base = Object.fromEntries(Object.entries(inherited).filter(([k]) => !gateKeys.includes(k)));
  const child = spawn(process.execPath, [WRAPPER, ...args], {
    cwd: appRoot,
    env: {
      ...base,
      FAKE_DOCKER_LOG: sb.log,
      PROBE_FILE: sb.probe,
      GATE_BROWSER_READY_S: "5",
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "";
  child.stdout.on("data", (d) => (out += d));
  child.stderr.on("data", (d) => (out += d));
  const done = new Promise((resolve) =>
    child.on("close", (code, signal) => resolve({ code, signal, out })),
  );
  return { child, done };
}

// Writes what the child saw of PW_GATE_WS (or "unset") to the probe file.
const probeCommand = () => [
  process.execPath,
  "-e",
  "require('node:fs').writeFileSync(process.env.PROBE_FILE, process.env.PW_GATE_WS ?? 'unset')",
];

const pairOf = (args, flag) => args[args.indexOf(flag) + 1];

describe("US-QG-01 the gate browser image and run arguments (issue 2429)", () => {
  test("US-QG-01 the pinned image is the Playwright of the installed package, as ds-snapshots derives it", () => {
    assert.equal(pinnedImage("1.65.1"), "mcr.microsoft.com/playwright:v1.65.1-noble");
    assert.equal(pinnedImage(INSTALLED), `mcr.microsoft.com/playwright:v${INSTALLED}-noble`);
  });

  test("US-QG-01 the container runs the run-server of the mounted node_modules, published to loopback only", () => {
    const image = pinnedImage("1.65.1");
    const args = gateBrowserRunArgs({
      name: "pflanzendex-gate-browser-7",
      image,
      port: 45123,
      nodeModules: "/Users/homelab/code/PflanzenDex/app/node_modules",
      label: "/Users/homelab/code/PflanzenDex",
    });
    assert.equal(args[0], "run");
    for (const flag of ["-d", "--init", "--ipc=host"]) assert.ok(args.includes(flag), flag);
    // No --rm: a container that dies keeps its logs for the failure message; the wrapper removes it (review of 3f030cae).
    assert.ok(!args.includes("--rm"), "the container stays until the wrapper removes it");
    assert.equal(
      pairOf(args, "--label"),
      "pflanzendex.gate-browser=/Users/homelab/code/PflanzenDex",
    );
    assert.equal(pairOf(args, "-p"), "127.0.0.1:45123:45123");
    assert.equal(
      pairOf(args, "-v"),
      "/Users/homelab/code/PflanzenDex/app/node_modules:/work/node_modules:ro",
    );
    assert.equal(pairOf(args, "--name"), "pflanzendex-gate-browser-7");
    assert.deepEqual(args.slice(args.indexOf(image) + 1), [
      "node",
      "/work/node_modules/playwright/cli.js",
      "run-server",
      "--host",
      "0.0.0.0",
      "--port",
      "45123",
    ]);
  });

  test("US-QG-01 the browser address is the loopback WebSocket of the published port", () => {
    assert.equal(gateBrowserWsEndpoint(45123), "ws://127.0.0.1:45123/");
  });

  test("US-QG-01 only UI_GATES_HOST=1 opts out to the host browser", () => {
    assert.equal(hostMode({ UI_GATES_HOST: "1" }), true);
    assert.equal(hostMode({ UI_GATES_HOST: "0" }), false);
    assert.equal(hostMode({ UI_GATES_HOST: "" }), false);
    assert.equal(hostMode({}), false);
  });
});

describe("US-QG-01 the gate browser run (issue 2429)", () => {
  test("US-QG-01 the host opt-out starts no container, says it is informational and passes no PW_GATE_WS", async () => {
    const sb = sandbox();
    const { done } = runWrapper(sb, probeCommand(sb), { UI_GATES_HOST: "1" });
    const result = await done;
    assert.equal(result.code, 0);
    assert.equal(readFileSync(sb.probe, "utf8"), "unset");
    assert.deepEqual(calls(sb), [], "no docker call");
    assert.match(result.out, /informational, not the gate/);
  });

  test("US-QG-01 the container starts, the run gets PW_GATE_WS on its published port and the container is removed after a passing run", async () => {
    const sb = sandbox();
    const { done } = runWrapper(sb, probeCommand(sb), { FAKE_IMAGE_PRESENT: "1" });
    const result = await done;
    assert.equal(result.code, 0, result.out);
    const run = calls(sb).find((c) => c.startsWith("run -d"));
    assert.ok(run, "docker run was called");
    const port = pairOf(run.split(" "), "-p").split(":")[1];
    assert.equal(readFileSync(sb.probe, "utf8"), `ws://127.0.0.1:${port}/`);
    assert.ok(
      calls(sb).some((c) => /^rm -f pflanzendex-gate-browser-\d+$/.test(c)),
      "container removed",
    );
  });

  test("US-QG-01 a failing test run passes its exit code on and still removes the container", async () => {
    const sb = sandbox();
    const { done } = runWrapper(sb, [process.execPath, "-e", "process.exit(3)"], {
      FAKE_IMAGE_PRESENT: "1",
    });
    const result = await done;
    assert.equal(result.code, 3);
    assert.ok(calls(sb).some((c) => c.startsWith("rm -f pflanzendex-gate-browser-")));
  });

  test("US-QG-01 a Ctrl-C stops the test run and removes the container", async () => {
    const sb = sandbox();
    const started = join(sb.dir, "started");
    const forever = [
      process.execPath,
      "-e",
      `require('node:fs').writeFileSync(${JSON.stringify(started)}, String(process.pid)); setInterval(() => {}, 1000)`,
    ];
    const { child, done } = runWrapper(sb, forever, { FAKE_IMAGE_PRESENT: "1" });
    await waitFor(() => existsSync(started));
    const runPid = Number(readFileSync(started, "utf8"));
    child.kill("SIGINT");
    const result = await done;
    assert.notEqual(result.code, 0, "the run does not pass");
    assert.ok(calls(sb).some((c) => c.startsWith("rm -f pflanzendex-gate-browser-")));
    assert.throws(() => process.kill(runPid, 0), "the test run is gone");
  });

  test("US-QG-01 a container that never reports its listener is removed and the run fails by name", async () => {
    const sb = sandbox();
    const { done } = runWrapper(sb, probeCommand(sb), {
      FAKE_IMAGE_PRESENT: "1",
      FAKE_NO_LISTEN: "1",
      GATE_BROWSER_READY_S: "1",
    });
    const result = await done;
    assert.equal(result.code, 1);
    assert.match(result.out, /did not start/);
    assert.equal(existsSync(sb.probe), false, "the tests did not start");
    assert.ok(calls(sb).some((c) => c.startsWith("rm -f pflanzendex-gate-browser-")));
  });

  test("US-QG-01 a container that does not start fails the run before any test", async () => {
    const sb = sandbox();
    const { done } = runWrapper(sb, probeCommand(sb), {
      FAKE_IMAGE_PRESENT: "1",
      FAKE_RUN_FAIL: "1",
    });
    const result = await done;
    assert.equal(result.code, 1);
    assert.match(result.out, /could not start/);
    assert.equal(existsSync(sb.probe), false, "the tests did not start");
  });

  test("US-QG-01 the image is pulled before the container starts when it is missing", async () => {
    const sb = sandbox();
    const { done } = runWrapper(sb, probeCommand(sb));
    const result = await done;
    assert.equal(result.code, 0, result.out);
    const log = calls(sb);
    const pull = log.findIndex((c) => c.startsWith("pull mcr.microsoft.com/playwright:v"));
    const run = log.findIndex((c) => c.startsWith("run -d"));
    assert.ok(pull >= 0 && pull < run, `pull before run, got ${JSON.stringify(log)}`);
  });

  test("US-QG-01 --image pulls the pinned image only when it is missing and starts no container", async () => {
    const missing = sandbox();
    const pulled = runWrapperArgs(missing, ["--image"]);
    const first = await pulled.done;
    assert.equal(first.code, 0, first.out);
    assert.ok(calls(missing).some((c) => c.startsWith("pull mcr.microsoft.com/playwright:v")));
    assert.ok(!calls(missing).some((c) => c.startsWith("run ")), "no container for --image");

    const present = sandbox();
    const kept = runWrapperArgs(present, ["--image"], { FAKE_IMAGE_PRESENT: "1" });
    const second = await kept.done;
    assert.equal(second.code, 0, second.out);
    assert.ok(!calls(present).some((c) => c.startsWith("pull ")), "a present image is not pulled");
  });

  test("US-QG-01 a stale container of an earlier run is removed before the new one starts", async () => {
    const sb = sandbox();
    const { done } = runWrapper(sb, probeCommand(sb), {
      FAKE_IMAGE_PRESENT: "1",
      FAKE_STALE: "old-run-1",
    });
    const result = await done;
    assert.equal(result.code, 0, result.out);
    const log = calls(sb);
    assert.ok(log.indexOf("rm -f old-run-1") < log.findIndex((c) => c.startsWith("run -d")));
  });
});

describe("US-QG-01 the gate browser: other checkouts, dead containers and port races (review of 3f030cae)", () => {
  test("US-QG-01 a stale-container sweep names this checkout's label and removes only its own containers", () => {
    const sb = sandbox();
    const table = join(sb.dir, "table.txt");
    writeFileSync(
      table,
      "pflanzendex-gate-browser-101 /checkouts/a/app\npflanzendex-gate-browser-202 /checkouts/b/app\n",
    );
    const docker = join(sb.bin, "docker-table");
    writeFileSync(docker, TABLE_DOCKER, { mode: 0o755 });
    const before = {
      FAKE_TABLE: process.env["FAKE_TABLE"],
      FAKE_DOCKER_LOG: process.env["FAKE_DOCKER_LOG"],
    };
    process.env["FAKE_TABLE"] = table;
    process.env["FAKE_DOCKER_LOG"] = sb.log;
    try {
      removeStale(docker, "/checkouts/a/app");
    } finally {
      for (const key of ["FAKE_TABLE", "FAKE_DOCKER_LOG"]) {
        if (before[key] === undefined) Reflect.deleteProperty(process.env, key);
        else process.env[key] = before[key];
      }
    }
    const log = calls(sb);
    assert.ok(
      log.some((c) => c === "ps -aq --filter label=pflanzendex.gate-browser=/checkouts/a/app"),
      `the sweep filters on its own label, got ${JSON.stringify(log)}`,
    );
    assert.ok(log.includes("rm -f pflanzendex-gate-browser-101"), "its own stale container goes");
    assert.ok(
      !log.some((c) => c.includes("pflanzendex-gate-browser-202")),
      "another checkout's container is left alone",
    );
  });

  test("US-QG-01 the wrapper's own sweep is filtered on its checkout's label", async () => {
    const sb = sandbox();
    const { done } = runWrapper(sb, probeCommand(sb), { FAKE_IMAGE_PRESENT: "1" });
    const result = await done;
    assert.equal(result.code, 0, result.out);
    assert.ok(
      calls(sb).some((c) => c === `ps -aq --filter label=pflanzendex.gate-browser=${gateAppRoot}`),
      "the sweep names this checkout",
    );
  });

  test("US-QG-01 a container that is gone (removed by docker) fails the run at once, not after the deadline", async () => {
    const sb = sandbox();
    const started = Date.now();
    const { done } = runWrapper(sb, probeCommand(sb), {
      FAKE_IMAGE_PRESENT: "1",
      FAKE_NO_LISTEN: "1",
      FAKE_INSPECT: "gone",
      FAKE_LOG_TEXT: "chromium: crashed before it listened",
      GATE_BROWSER_READY_S: "30",
    });
    const result = await done;
    assert.equal(result.code, 1);
    assert.ok(Date.now() - started < 10_000, "did not wait for the 30 s deadline");
    assert.match(result.out, /did not start/);
    assert.match(
      result.out,
      /chromium: crashed before it listened/,
      "the logs of the container are kept",
    );
    assert.equal(existsSync(sb.probe), false, "the tests did not start");
  });

  test("US-QG-01 a container that exited fails the run at once and names its logs", async () => {
    const sb = sandbox();
    const started = Date.now();
    const { done } = runWrapper(sb, probeCommand(sb), {
      FAKE_IMAGE_PRESENT: "1",
      FAKE_NO_LISTEN: "1",
      FAKE_INSPECT: "false",
      FAKE_LOG_TEXT: "run-server: out of memory",
      GATE_BROWSER_READY_S: "30",
    });
    const result = await done;
    assert.equal(result.code, 1);
    assert.ok(Date.now() - started < 10_000, "did not wait for the 30 s deadline");
    assert.match(result.out, /run-server: out of memory/);
    assert.ok(calls(sb).some((c) => c.startsWith("rm -f pflanzendex-gate-browser-")));
  });

  test("US-QG-01 a bind race on the chosen port is retried once on a new port, and the run goes on", async () => {
    const sb = sandbox();
    const { done } = runWrapper(sb, probeCommand(sb), {
      FAKE_IMAGE_PRESENT: "1",
      FAKE_BIND_FAIL: "once",
    });
    const result = await done;
    assert.equal(result.code, 0, result.out);
    const log = calls(sb);
    const runs = log.filter((c) => c.startsWith("run -d"));
    assert.equal(runs.length, 2, `the start was retried once, got ${JSON.stringify(log)}`);
    const ports = runs.map((r) => pairOf(r.split(" "), "-p").split(":")[1]);
    assert.notEqual(ports[0], ports[1], "the retry picks a new port");
    assert.equal(
      readFileSync(sb.probe, "utf8"),
      `ws://127.0.0.1:${ports[1]}/`,
      "the tests reach the port of the container that started",
    );
    const removed = log.findIndex((c) => /^rm -f pflanzendex-gate-browser-\d+$/.test(c));
    assert.ok(
      removed > log.indexOf(runs[0]) && removed < log.indexOf(runs[1]),
      "the failed start's name is freed before the retry",
    );
    assert.match(result.out, /taken/);
  });

  test("US-QG-01 a second bind race fails the run; the start is retried only once", async () => {
    const sb = sandbox();
    const { done } = runWrapper(sb, probeCommand(sb), {
      FAKE_IMAGE_PRESENT: "1",
      FAKE_BIND_FAIL: "always",
    });
    const result = await done;
    assert.equal(result.code, 1);
    assert.equal(calls(sb).filter((c) => c.startsWith("run -d")).length, 2);
    assert.match(result.out, /could not start/);
    assert.equal(existsSync(sb.probe), false, "the tests did not start");
  });
});

async function waitFor(predicate, ms = 20_000) {
  const until = Date.now() + ms;
  while (!predicate()) {
    if (Date.now() > until) throw new Error("waitFor: the condition did not hold");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
