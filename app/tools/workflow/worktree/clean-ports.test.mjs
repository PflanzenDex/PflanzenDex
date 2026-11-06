// Tests of `make clean-ports` (US-DEV-01): the listeners are found by port, only the own processes are stopped, and the
// run says what it stopped. The system calls are faked, except the last test, which starts a real listener of this user.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { connect, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import {
  MAIN_CHECKOUT_PORTS,
  cleanPorts,
  devPorts,
  listenersOf,
  parseLsof,
  parseSs,
} from "./clean-ports.mjs";

const madeDirs = [];
after(() => {
  for (const dir of madeDirs) rmSync(dir, { recursive: true, force: true });
});

// A fake system: `listeners` maps a port to the pids that listen on it; `owners` and `commands` map a pid to its uid and
// its command line. `killed` lists every signal sent. SIGTERM removes the pid from the listeners, unless `ignoresTerm`.
function fakeSystem({
  listeners = {},
  owners = {},
  commands = {},
  lsofMissing = false,
  ignoresTerm = [],
} = {}) {
  const state = { listeners: structuredClone(listeners), calls: [], killed: [] };
  const run = (cmd, args) => {
    state.calls.push([cmd, ...args]);
    if (cmd === "lsof") {
      if (lsofMissing) return { missing: true };
      const port = Number(args.find((a) => a.startsWith("-iTCP:")).slice("-iTCP:".length));
      const pids = state.listeners[port] ?? [];
      return { code: pids.length ? 0 : 1, stdout: pids.map((p) => `${p}\n`).join(""), stderr: "" };
    }
    if (cmd === "ss") {
      const port = Number(args.at(-1).match(/:(\d+)$/)[1]);
      const pids = state.listeners[port] ?? [];
      const stdout = pids
        .map((p) => `LISTEN 0 511 0.0.0.0:${port} 0.0.0.0:* users:(("node",pid=${p},fd=21))\n`)
        .join("");
      return { code: 0, stdout, stderr: "" };
    }
    if (cmd === "ps") {
      const pid = Number(args.at(-1));
      const field = args[1];
      if (field === "uid=")
        return owners[pid] === undefined
          ? { code: 1, stdout: "", stderr: "" }
          : { code: 0, stdout: `${owners[pid]}\n`, stderr: "" };
      return { code: 0, stdout: `${commands[pid] ?? "unknown"}\n`, stderr: "" };
    }
    throw new Error(`unexpected command ${cmd}`);
  };
  const kill = (pid, signal) => {
    state.killed.push([pid, signal]);
    if (signal === "SIGKILL" || (signal === "SIGTERM" && !ignoresTerm.includes(pid))) {
      for (const port of Object.keys(state.listeners)) {
        state.listeners[port] = state.listeners[port].filter((p) => p !== pid);
      }
    }
  };
  return { state, run, kill };
}

function deps(system, extra = {}) {
  const lines = [];
  return {
    system,
    options: {
      run: system.run,
      kill: system.kill,
      sleep: async () => {},
      graceMs: 300,
      pollMs: 100,
      log: (line) => lines.push(line),
      ...extra,
    },
    lines,
  };
}

const PORTS = [
  { name: "API", port: 55197 },
  { name: "web", port: 55697 },
];

describe("US-DEV-01 clean-ports", () => {
  test("US-DEV-01 nothing listens on the dev ports: nothing is stopped and the run succeeds", async () => {
    const system = fakeSystem();
    const { options, lines } = deps(system);
    const result = await cleanPorts({ ports: PORTS, uid: 1000, ...options });
    assert.equal(result.ok, true);
    assert.deepEqual(result.stopped, []);
    assert.deepEqual(system.state.killed, []);
    assert.match(lines.join("\n"), /nothing listens on API port 55197/);
    assert.match(lines.join("\n"), /nothing listens on web port 55697/);
  });

  test("US-DEV-01 stops the own listener of a dev port and names the process it stopped", async () => {
    const system = fakeSystem({
      listeners: { 55197: [4242] },
      owners: { 4242: 1000 },
      commands: { 4242: "node --watch src/main.ts" },
    });
    const { options, lines } = deps(system);
    const result = await cleanPorts({ ports: PORTS, uid: 1000, ...options });
    assert.equal(result.ok, true);
    assert.deepEqual(system.state.killed, [[4242, "SIGTERM"]]);
    assert.deepEqual(result.stopped, [
      { pid: 4242, port: 55197, name: "API", command: "node --watch src/main.ts" },
    ]);
    assert.match(
      lines.join("\n"),
      /stopped 4242 \(node --watch src\/main\.ts\) listening on API port 55197/,
    );
  });

  test("US-DEV-01 never stops a process of another user, and the run fails so the port is not reported free", async () => {
    const system = fakeSystem({
      listeners: { 55197: [777] },
      owners: { 777: 0 },
      commands: { 777: "node /srv/other.js" },
    });
    const { options, lines } = deps(system);
    const result = await cleanPorts({ ports: PORTS, uid: 1000, ...options });
    assert.equal(result.ok, false);
    assert.deepEqual(system.state.killed, []);
    assert.deepEqual(
      result.skipped.map((s) => s.pid),
      [777],
    );
    assert.match(lines.join("\n"), /skipped 777 .* owner uid 0/);
  });

  test("US-DEV-01 a listener that ignores SIGTERM is stopped with SIGKILL", async () => {
    const system = fakeSystem({
      listeners: { 55697: [5151] },
      owners: { 5151: 1000 },
      commands: { 5151: "vite" },
      ignoresTerm: [5151],
    });
    const { options } = deps(system);
    const result = await cleanPorts({ ports: PORTS, uid: 1000, ...options });
    assert.equal(result.ok, true);
    assert.deepEqual(system.state.killed, [
      [5151, "SIGTERM"],
      [5151, "SIGKILL"],
    ]);
  });

  test("US-DEV-01 matches by port only: lsof asks for the port and stops at the port's own listeners", async () => {
    const system = fakeSystem({
      listeners: { 55197: [], 55697: [6060] },
      owners: { 6060: 1000 },
      commands: { 6060: "vite" },
    });
    const { options } = deps(system);
    const result = await cleanPorts({ ports: PORTS, uid: 1000, ...options });
    // Every lookup names one of the two dev ports and listens state only; nothing else is asked for.
    const lookups = system.state.calls
      .filter((c) => c[0] === "lsof")
      .map((c) => c.find((a) => a.startsWith("-iTCP:")));
    assert.ok(lookups.length >= 2);
    assert.deepEqual(new Set(lookups), new Set(["-iTCP:55197", "-iTCP:55697"]));
    for (const call of system.state.calls.filter((c) => c[0] === "lsof")) {
      assert.ok(call.includes("-sTCP:LISTEN"));
    }
    assert.deepEqual(
      result.stopped.map((s) => s.pid),
      [6060],
    );
  });

  test("US-DEV-01 falls back to ss when lsof is not installed", async () => {
    const system = fakeSystem({
      listeners: { 55197: [4343] },
      owners: { 4343: 1000 },
      commands: { 4343: "node dev" },
      lsofMissing: true,
    });
    const { options } = deps(system);
    const result = await cleanPorts({ ports: PORTS, uid: 1000, ...options });
    assert.deepEqual(
      result.stopped.map((s) => s.pid),
      [4343],
    );
    assert.ok(system.state.calls.some((c) => c[0] === "ss"));
  });

  test("US-DEV-01 a failing port lookup stops the run with its message and kills nothing (P-10)", async () => {
    const run = () => ({ code: 2, stdout: "", stderr: "lsof: permission denied" });
    await assert.rejects(
      cleanPorts({
        ports: PORTS,
        uid: 1000,
        run,
        kill: () => assert.fail("no kill"),
        sleep: async () => {},
        log: () => {},
      }),
      /lsof: permission denied/,
    );
  });

  test("US-DEV-01 the dev ports come from .env.worktree, and the main checkout uses 3000 and 5173", () => {
    const dir = mkdtempSync(join(tmpdir(), "clean-ports-env-"));
    madeDirs.push(dir);
    const file = join(dir, ".env.worktree");
    writeFileSync(
      file,
      "PFLANZENDEX_TEST_DB_PORT=54697\nPFLANZENDEX_DEV_API_PORT=55197\nPFLANZENDEX_DEV_WEB_PORT=55697\n",
    );
    assert.deepEqual(devPorts(file), { api: 55197, web: 55697 });
    assert.deepEqual(devPorts(join(dir, "missing.env")), MAIN_CHECKOUT_PORTS);
    assert.deepEqual(MAIN_CHECKOUT_PORTS, { api: 3000, web: 5173 });
  });
});

describe("US-DEV-01 clean-ports parsing", () => {
  test("US-DEV-01 parseLsof reads one pid per line and ignores blank lines", () => {
    assert.deepEqual(parseLsof("4242\n4243\n\n"), [4242, 4243]);
    assert.deepEqual(parseLsof(""), []);
  });

  test("US-DEV-01 parseSs reads the pids of an ss listener line, each once", () => {
    const text =
      'LISTEN 0 511 0.0.0.0:55197 0.0.0.0:* users:(("node",pid=4343,fd=21))\n' +
      'LISTEN 0 511 [::]:55197 [::]:* users:(("node",pid=4343,fd=22))\n';
    assert.deepEqual(parseSs(text), [4343]);
  });

  test("US-DEV-01 listenersOf returns no pids when lsof finds none (exit 1, no output)", () => {
    const run = () => ({ code: 1, stdout: "", stderr: "" });
    assert.deepEqual(listenersOf(55197, run), []);
  });
});

describe("US-DEV-01 clean-ports on a real listener", () => {
  test("US-DEV-01 stops a real listener of this user and frees its port", async () => {
    const free = () =>
      new Promise((resolve) => {
        const server = createServer();
        server.once("error", () => resolve(0));
        server.listen(0, "127.0.0.1", () => {
          const { port } = server.address();
          server.close(() => resolve(port));
        });
      });
    const port = await free();
    const other = await free();
    const child = spawn(
      process.execPath,
      ["-e", `require("net").createServer().listen(${port}, "127.0.0.1")`],
      { stdio: "ignore" },
    );
    const exited = new Promise((resolve) => child.once("exit", resolve));
    // Wait until the child listens: the port is busy when a connection succeeds.
    for (let i = 0; i < 100; i++) {
      const up = await new Promise((resolve) => {
        const socket = connect(port, "127.0.0.1");
        socket.once("connect", () => (socket.destroy(), resolve(true)));
        socket.once("error", () => resolve(false));
      });
      if (up) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    const result = await cleanPorts({
      ports: [
        { name: "API", port },
        { name: "web", port: other },
      ],
      uid: process.getuid(),
      log: () => {},
    });
    await exited;
    assert.equal(result.ok, true);
    assert.deepEqual(
      result.stopped.map((s) => s.pid),
      [child.pid],
    );
    assert.deepEqual(listenersOf(port), []);
  });
});
