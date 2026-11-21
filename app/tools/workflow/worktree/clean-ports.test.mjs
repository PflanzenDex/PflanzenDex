// Tests of `make clean-ports` (US-DEV-01): the listeners are found by port, only the own processes are stopped, and the
// run says what it stopped. The system calls are faked, except the last test, which starts a real listener of this user.
// The checkout check of the e2e ports (US-DEV-08, issue 2390) is in the same file; its module is clean-ports.checkout.mjs.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
  runCommand,
} from "./clean-ports.mjs";
import {
  assertOwnServers,
  checkoutOf,
  cwdOf,
  e2eServerGuard,
  foreignListeners,
  gitEnvironment,
} from "./clean-ports.checkout.mjs";

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

// US-DEV-08 (issue 2390): a local Playwright run never reuses a server of another checkout. The host is faked, except the
// real-server test at the end. Every test passes `file` and `run`, so none reads this checkout's .env.worktree or runs git.
const MAIN = "/home/dev/PflanzenDex";
const WORKTREE = `${MAIN}/.worktrees/fix-issue-2390`;
const E2E_DIR = `${WORKTREE}/app/packages/e2e`;
const ABSENT = "/home/dev/no-such-dir/env-worktree.fixture";

// A fake host for the owner check. `listeners` maps a port to its pids; `cwds` maps a pid to its working directory as lsof
// reports it (absent: unknown); `proc` maps a pid to its /proc/<pid>/cwd link (absent: readlink fails); `tops` maps a
// directory to its git top level (absent: not a git checkout); `ended` lists the pids that have ended.
function hostStub({ listeners = {}, cwds = {}, proc = {}, tops = {}, ended = [] } = {}) {
  const calls = [];
  const run = (cmd, args) => {
    calls.push([cmd, ...args]);
    if (cmd === "lsof" && args.some((a) => a.startsWith("-iTCP:"))) {
      const port = Number(args.find((a) => a.startsWith("-iTCP:")).slice("-iTCP:".length));
      const pids = listeners[port] ?? [];
      return { code: pids.length ? 0 : 1, stdout: pids.map((p) => `${p}\n`).join(""), stderr: "" };
    }
    if (cmd === "lsof" && args.includes("cwd")) {
      const pid = Number(args[args.indexOf("-p") + 1]);
      const cwd = cwds[pid];
      if (cwd === undefined) return { code: 1, stdout: "", stderr: "" };
      return { code: 0, stdout: `p${pid}\nfcwd\nn${cwd}\n`, stderr: "" };
    }
    if (cmd === "readlink") {
      const pid = Number(args[0].split("/")[2]);
      if (proc[pid] === undefined) return { code: 1, stdout: "", stderr: "" };
      return { code: 0, stdout: `${proc[pid]}\n`, stderr: "" };
    }
    if (cmd === "git") {
      const top = tops[args[1]];
      if (top === undefined)
        return { code: 128, stdout: "", stderr: "fatal: not a git repository" };
      return { code: 0, stdout: `${top}\n`, stderr: "" };
    }
    if (cmd === "ps") {
      const pid = Number(args.at(-1));
      if (ended.includes(pid)) return { code: 1, stdout: "", stderr: "" };
      const text = args[1] === "uid=" ? "1000" : "node server.js";
      return { code: 0, stdout: `${text}\n`, stderr: "" };
    }
    throw new Error(`unexpected command ${cmd}`);
  };
  return { run, calls };
}

const guardOf = (run, extra = {}) => ({ env: {}, dir: E2E_DIR, file: ABSENT, run, ...extra });

describe("US-DEV-08 the owner check of the e2e ports", () => {
  test("US-DEV-08 a server of another checkout on the port is refused, and one message names the port, the pid, the other checkout and this checkout", () => {
    const host = hostStub({
      listeners: { 5173: [4242] },
      cwds: { 4242: `${MAIN}/app` },
      tops: { [`${MAIN}/app`]: MAIN, [E2E_DIR]: WORKTREE },
    });
    assert.throws(
      () => e2eServerGuard(guardOf(host.run)),
      (error) => {
        const m = error.message;
        return (
          (m.match(/^e2e:/gm) ?? []).length === 1 &&
          /E2E_WEB_PORT 5173: pid 4242 \(node server\.js\)/.test(m) &&
          m.includes(`another checkout: ${MAIN}`) &&
          m.includes(`this checkout: ${WORKTREE}`) &&
          m.includes("E2E_WEB_PORT") &&
          m.includes("E2E_API_PORT")
        );
      },
    );
  });

  test("US-DEV-08 the server of this worktree on the port is accepted and reused", () => {
    const host = hostStub({
      listeners: { 5173: [4242] },
      cwds: { 4242: `${WORKTREE}/app` },
      tops: { [`${WORKTREE}/app`]: WORKTREE, [E2E_DIR]: WORKTREE },
    });
    assert.deepEqual(e2eServerGuard(guardOf(host.run)), { web: 5173, api: 3000 });
  });

  test("US-DEV-08 nothing listening on the ports passes, and no process is looked at", () => {
    const host = hostStub({ tops: { [E2E_DIR]: WORKTREE } });
    assert.deepEqual(e2eServerGuard(guardOf(host.run)), { web: 5173, api: 3000 });
    assert.equal(
      host.calls.some((c) => c[0] === "ps" || c[0] === "readlink" || c.includes("cwd")),
      false,
    );
  });

  test("US-DEV-08 a listener whose working directory is unknown counts as foreign, and the message names its pid and command", () => {
    const host = hostStub({ listeners: { 3000: [777] }, tops: { [E2E_DIR]: WORKTREE } });
    assert.throws(
      () => e2eServerGuard(guardOf(host.run)),
      (error) =>
        /E2E_API_PORT 3000: pid 777 \(node server\.js\)/.test(error.message) &&
        /unknown/.test(error.message),
    );
  });

  test("US-DEV-08 a process outside any git checkout counts as foreign", () => {
    const host = hostStub({
      listeners: { 5173: [888] },
      cwds: { 888: "/srv/other" },
      tops: { [E2E_DIR]: WORKTREE },
    });
    assert.throws(
      () => e2eServerGuard(guardOf(host.run)),
      (error) =>
        /pid 888/.test(error.message) &&
        /\/srv\/other/.test(error.message) &&
        /no git checkout/.test(error.message),
    );
  });

  test("US-DEV-08 both ports held by other checkouts give one message that names both", () => {
    const host = hostStub({
      listeners: { 5173: [4242], 3000: [4343] },
      cwds: { 4242: MAIN, 4343: MAIN },
      tops: { [MAIN]: MAIN, [E2E_DIR]: WORKTREE },
    });
    assert.throws(
      () => e2eServerGuard(guardOf(host.run)),
      (error) =>
        (error.message.match(/^e2e:/gm) ?? []).length === 1 &&
        /E2E_WEB_PORT 5173/.test(error.message) &&
        /E2E_API_PORT 3000/.test(error.message),
    );
  });

  test("US-DEV-08 a listener that ended while it was looked at is not a listener", () => {
    const host = hostStub({
      listeners: { 5173: [999] },
      ended: [999],
      tops: { [E2E_DIR]: WORKTREE },
    });
    assert.deepEqual(e2eServerGuard(guardOf(host.run)), { web: 5173, api: 3000 });
  });

  test("US-DEV-08 a worker, which loads the config again, does not repeat the check once the main process made it", () => {
    const host = hostStub({
      listeners: { 5173: [4242] },
      cwds: { 4242: MAIN },
      tops: { [MAIN]: MAIN, [E2E_DIR]: WORKTREE },
    });
    assert.deepEqual(e2eServerGuard(guardOf(host.run, { checked: true })), {
      web: 5173,
      api: 3000,
    });
    assert.equal(host.calls.length, 0);
  });

  test("US-DEV-08 in CI nothing is checked: no system call, and the ports are the environment's or the defaults", () => {
    const noCall = () => {
      throw new Error("CI must not run a system call");
    };
    assert.deepEqual(
      e2eServerGuard({ env: { CI: "true" }, dir: E2E_DIR, file: ABSENT, run: noCall }),
      { web: 5173, api: 3000 },
    );
    assert.deepEqual(
      e2eServerGuard({
        env: { CI: "true", E2E_WEB_PORT: "5180", E2E_API_PORT: "3010" },
        dir: E2E_DIR,
        file: ABSENT,
        run: noCall,
      }),
      { web: 5180, api: 3010 },
    );
  });

  test("US-DEV-08 in CI no worktree file is read, even one with the e2e keys: CI keeps the ports it had before", () => {
    const dir = mkdtempSync(join(tmpdir(), "clean-ports-ci-"));
    madeDirs.push(dir);
    const file = join(dir, "env-worktree.fixture");
    writeFileSync(file, "PFLANZENDEX_E2E_WEB_PORT=56871\nPFLANZENDEX_E2E_API_PORT=56371\n");
    const noCall = () => {
      throw new Error("CI must not run a system call");
    };
    assert.deepEqual(e2eServerGuard({ env: { CI: "true" }, dir: E2E_DIR, file, run: noCall }), {
      web: 5173,
      api: 3000,
    });
    // Outside CI the same file gives this worktree its own ports, which is the point of the check.
    assert.deepEqual(e2eServerGuard({ env: {}, dir: E2E_DIR, file, run: hostStub().run }), {
      web: 56871,
      api: 56371,
    });
  });

  test("US-DEV-08 the working directory comes from /proc on Linux, with lsof as the fallback, and from lsof on macOS", () => {
    const linux = hostStub({ proc: { 4242: "/home/dev/a" }, cwds: { 4242: "/home/dev/b" } });
    assert.equal(cwdOf(4242, linux.run, "linux"), "/home/dev/a");
    assert.deepEqual(
      linux.calls.map((c) => c[0]),
      ["readlink"],
    );
    const fallback = hostStub({ cwds: { 4242: "/home/dev/b" } });
    assert.equal(cwdOf(4242, fallback.run, "linux"), "/home/dev/b");
    assert.deepEqual(
      fallback.calls.map((c) => c[0]),
      ["readlink", "lsof"],
    );
    const mac = hostStub({ cwds: { 4242: "/Users/dev/c" } });
    assert.equal(cwdOf(4242, mac.run, "darwin"), "/Users/dev/c");
    assert.deepEqual(
      mac.calls.map((c) => c[0]),
      ["lsof"],
    );
    assert.equal(cwdOf(4243, hostStub().run, "darwin"), undefined);
  });

  test("US-DEV-08 the checkout of a directory is its git top level, and a directory outside git has none", () => {
    const host = hostStub({ tops: { "/home/dev/x/app": "/home/dev/x" } });
    assert.equal(checkoutOf("/home/dev/x/app", host.run), "/home/dev/x");
    assert.equal(checkoutOf("/home/dev/none", host.run), undefined);
  });

  test("US-DEV-08 the repository variables of a git hook are not passed on when a checkout is asked", () => {
    assert.deepEqual(
      gitEnvironment({
        PATH: "/bin",
        GIT_DIR: "/hook/.git",
        GIT_WORK_TREE: "/hook",
        GIT_INDEX_FILE: "/hook/index",
      }),
      { PATH: "/bin" },
    );
  });

  test("US-DEV-08 assertOwnServers passes when every listener is of the checkout", () => {
    const host = hostStub({
      listeners: { 5173: [4242] },
      cwds: { 4242: WORKTREE },
      tops: { [WORKTREE]: WORKTREE },
    });
    assert.doesNotThrow(() =>
      assertOwnServers({
        ports: [{ name: "E2E_WEB_PORT", port: 5173 }],
        checkout: WORKTREE,
        run: host.run,
        platform: "darwin",
      }),
    );
  });
});

// A real server started with its working directory in another git checkout. Skipped only when neither lsof nor /proc exists.
function gitRepo() {
  const dir = mkdtempSync(join(tmpdir(), "e2e-checkout-"));
  madeDirs.push(dir);
  const init = spawnSync("git", ["init", "-q", dir], {
    encoding: "utf8",
    env: gitEnvironment(),
  });
  assert.equal(init.status, 0, init.stderr);
  return dir;
}

async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForListener(port) {
  for (let i = 0; i < 100; i++) {
    const up = await new Promise((resolve) => {
      const socket = connect(port, "127.0.0.1");
      socket.once("connect", () => (socket.destroy(), resolve(true)));
      socket.once("error", () => resolve(false));
    });
    if (up) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`nothing listens on ${port}`);
}

describe("US-DEV-08 the owner check on a real server", () => {
  test("US-DEV-08 a real server started in another git checkout is foreign to this checkout and own in its own", async (t) => {
    const observable = existsSync("/proc/self") || !runCommand("lsof", ["-v"]).missing;
    if (!observable) return t.skip("neither lsof nor /proc is available");
    const repoA = gitRepo();
    const repoB = gitRepo();
    const port = await freePort();
    const child = spawn(
      process.execPath,
      ["-e", `require("net").createServer().listen(${port}, "127.0.0.1")`],
      { cwd: repoA, stdio: "ignore" },
    );
    const exited = new Promise((resolve) => child.once("exit", resolve));
    try {
      await waitForListener(port);
      const checkoutA = checkoutOf(repoA);
      const checkoutB = checkoutOf(repoB);
      assert.notEqual(checkoutA, checkoutB);
      assert.deepEqual(
        foreignListeners(port, checkoutB).map((l) => [l.pid, l.checkout]),
        [[child.pid, checkoutA]],
      );
      assert.deepEqual(foreignListeners(port, checkoutA), []);
      assert.throws(
        () => assertOwnServers({ ports: [{ name: "E2E_WEB_PORT", port }], checkout: checkoutB }),
        (error) => error.message.includes(checkoutA) && error.message.includes(String(port)),
      );
    } finally {
      child.kill("SIGTERM");
      await exited;
    }
  });
});
