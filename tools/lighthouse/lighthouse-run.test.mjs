// FR-QG-09 / issue 1733: lighthouse-run.sh refuses a port that something holds, before anything starts. The check asks the
// port over HTTP and for a listener: ss where it exists (CI), lsof where it does not (macOS). The tests hold the port with
// a test server; no Chrome and no vite start, and the refusal happens before the script writes or removes anything.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("./lighthouse-run.sh", import.meta.url));

// Folders this file makes are removed after it, also when a test fails (#1278).
const madeDirs = [];
after(() => {
  for (const dir of madeDirs) fs.rmSync(dir, { recursive: true, force: true });
});

/** The absolute path of a command, or undefined when it is not installed. */
function tool(name) {
  const found = spawnSync("sh", ["-c", `command -v ${name}`], { encoding: "utf8" });
  return found.status === 0 ? found.stdout.trim() : undefined;
}

/** A folder with symlinks to the named tools only: the PATH of a run that lacks the others (ss, lsof). */
function toolsOnly(names) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lighthouse-run-tools-"));
  madeDirs.push(dir);
  for (const name of names) fs.symlinkSync(tool(name), path.join(dir, name));
  return dir;
}

/** An HTTP server on a free port that answers every request. */
function httpServer() {
  const server = http.createServer((_request, response) => response.end("some other server"));
  return listen(server);
}

/** A raw TCP listener on a free port: it accepts connections and never speaks HTTP. */
function silentServer() {
  return listen(net.createServer(() => {}));
}

/**
 * Listens on a free loopback port. The sockets are tracked: a connection the script left open (a curl it was stopped in)
 * would otherwise keep close() waiting for ever, since a raw TCP server never answers and never ends it.
 */
function listen(server) {
  const sockets = new Set();
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () =>
      resolve({
        port: server.address().port,
        close: () =>
          new Promise((done) => {
            for (const socket of sockets) socket.destroy();
            server.close(done);
          }),
      }),
    ),
  );
}

/**
 * Runs the script with the given PATH and port; resolves with the exit code and both output streams. The output goes to
 * files, not pipes, and the script runs in a group of its own: a script that hangs is stopped with its group after the
 * limit, and a process it left behind cannot keep the test waiting.
 */
function runScript({ port, path: searchPath = process.env.PATH }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lighthouse-run-"));
  madeDirs.push(dir);
  const outFile = path.join(dir, "stdout.txt");
  const errFile = path.join(dir, "stderr.txt");
  const fdOut = fs.openSync(outFile, "w");
  const fdErr = fs.openSync(errFile, "w");
  return new Promise((resolve) => {
    const child = spawn(tool("bash"), [SCRIPT], {
      env: { ...process.env, PATH: searchPath, E2E_WEB_PORT: String(port) },
      stdio: ["ignore", fdOut, fdErr],
      detached: true,
    });
    const stopGroup = (signal) => {
      try {
        process.kill(-child.pid, signal);
      } catch {
        // the group is already gone
      }
    };
    // SIGTERM first: the script's exit trap stops its preview server; SIGKILL when that does not end it.
    const limit = setTimeout(() => {
      stopGroup("SIGTERM");
      setTimeout(() => stopGroup("SIGKILL"), 3_000).unref();
    }, 20_000);
    limit.unref();
    child.on("exit", (code) => {
      clearTimeout(limit);
      stopGroup("SIGKILL");
      fs.closeSync(fdOut);
      fs.closeSync(fdErr);
      resolve({
        code: code ?? 1,
        stdout: fs.readFileSync(outFile, "utf8"),
        stderr: fs.readFileSync(errFile, "utf8"),
      });
    });
  });
}

test("FR-QG-09 (issue 1733): the run refuses a port that an HTTP server holds, exit 1 with already in use", async () => {
  const server = await httpServer();
  try {
    const result = await runScript({ port: server.port });
    assert.equal(result.code, 1, result.stderr);
    assert.match(result.stderr, new RegExp(`port ${server.port} is already in use`));
  } finally {
    await server.close();
  }
});

test("FR-QG-09 (issue 1733): the run refuses a port held by a listener that never speaks HTTP, exit 1 with already in use", async () => {
  const server = await silentServer();
  try {
    const result = await runScript({ port: server.port });
    assert.equal(result.code, 1, result.stderr);
    assert.match(result.stderr, new RegExp(`port ${server.port} is already in use`));
  } finally {
    await server.close();
  }
});

test("FR-QG-09 (issue 1733): without ss the lsof check still refuses a listener that never speaks HTTP", async (t) => {
  if (!tool("lsof")) return t.skip("lsof is not installed");
  const server = await silentServer();
  try {
    // curl, dirname and lsof only: no ss on this PATH, so the listener can only be seen by lsof.
    const result = await runScript({
      port: server.port,
      path: toolsOnly(["curl", "dirname", "lsof"]),
    });
    assert.equal(result.code, 1, result.stderr);
    assert.match(result.stderr, new RegExp(`port ${server.port} is already in use`));
  } finally {
    await server.close();
  }
});

test("FR-QG-09 (issue 1733): with neither ss nor lsof the run refuses, because it cannot tell whether the port is free", async () => {
  const server = await silentServer();
  try {
    const result = await runScript({ port: server.port, path: toolsOnly(["curl", "dirname"]) });
    assert.equal(result.code, 1, result.stderr);
    assert.match(result.stderr, /neither ss nor lsof is installed/);
  } finally {
    await server.close();
  }
});
