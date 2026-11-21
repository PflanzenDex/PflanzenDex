// FR-QG-09 / issue 1733: before a Lighthouse run, the server that answers the port must serve the index.html of the build
// just made. served-build.mjs compares the served page with that file: exit 0 when the bytes are equal, exit 1 with a message
// on stderr otherwise (another build, an error page, or no answer at all). The tests start real HTTP servers on free ports.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("./served-build.mjs", import.meta.url));

// Folders this file makes are removed after it, also when a test fails (#1278).
const madeDirs = [];
after(() => {
  for (const dir of madeDirs) fs.rmSync(dir, { recursive: true, force: true });
});

/** A file with the given content in a new folder: the dist/index.html of a test. */
function distFile(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "served-build-"));
  madeDirs.push(dir);
  const file = path.join(dir, "index.html");
  fs.writeFileSync(file, content);
  return file;
}

/** An HTTP server on a free port that answers every request with `body` and `status`. */
function serve(body, status = 200) {
  const server = http.createServer((_request, response) => {
    response.writeHead(status, { "content-type": "text/html; charset=utf-8" });
    response.end(body);
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () =>
      resolve({
        port: server.address().port,
        close: () =>
          new Promise((done) => {
            server.closeAllConnections();
            server.close(done);
          }),
      }),
    ),
  );
}

/** A port that nothing listens on: a server is opened on it and closed again. */
async function freePort() {
  const server = await serve("");
  const { port } = server;
  await server.close();
  return port;
}

/** Runs served-build.mjs with the arguments and the given environment; resolves with the exit code and stderr. */
function check(args, env = {}) {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [SCRIPT, ...args],
      { env: { ...process.env, ...env }, timeout: 30_000 },
      (error, stdout, stderr) => {
        const code = error ? (typeof error.code === "number" ? error.code : 1) : 0;
        resolve({ code, stdout, stderr });
      },
    );
  });
}

const DIST_HTML = `<!doctype html><html lang="de"><title>PflanzenDéx</title><script type="module" src="/assets/index-a1.js"></script></html>\n`;

test("FR-QG-09 (issue 1733): the page served at the port equal to dist/index.html passes with exit 0", async () => {
  const server = await serve(DIST_HTML);
  try {
    const result = await check([`http://127.0.0.1:${server.port}/`, distFile(DIST_HTML)]);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stderr, "");
  } finally {
    await server.close();
  }
});

test("FR-QG-09 (issue 1733): another build on the port fails with exit 1 and says to stop the old preview", async () => {
  const stale = DIST_HTML.replace("index-a1.js", "index-0ld.js");
  const server = await serve(stale);
  try {
    const result = await check([`http://127.0.0.1:${server.port}/`, distFile(DIST_HTML)]);
    assert.equal(result.code, 1);
    assert.match(
      result.stderr,
      new RegExp(`port ${server.port} serves another build than dist/; stop the old preview`),
    );
  } finally {
    await server.close();
  }
});

test("FR-QG-09 (issue 1733): a server that answers an error page is not the build: exit 1", async () => {
  const server = await serve(DIST_HTML, 404);
  try {
    const result = await check([`http://127.0.0.1:${server.port}/`, distFile(DIST_HTML)]);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /answers HTTP 404/);
  } finally {
    await server.close();
  }
});

test("FR-QG-09 (issue 1733): nothing answering the port fails with exit 1 and a message", async () => {
  const port = await freePort();
  const result = await check([`http://127.0.0.1:${port}/`, distFile(DIST_HTML)]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /nothing answers at http:\/\/127\.0\.0\.1:\d+\//);
});

test("FR-QG-09 (issue 1733): a listener that accepts and never answers fails within its timeout, not at once", async () => {
  // A raw TCP listener: the connection succeeds and no HTTP response ever comes (a stale process of another kind).
  const silent = net.createServer(() => {});
  const sockets = new Set();
  silent.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise((resolve) => silent.listen(0, "127.0.0.1", resolve));
  try {
    const started = Date.now();
    const result = await check(
      [`http://127.0.0.1:${silent.address().port}/`, distFile(DIST_HTML)],
      { SERVED_BUILD_TIMEOUT_MS: "500" },
    );
    assert.equal(result.code, 1);
    assert.match(result.stderr, /nothing answers/);
    assert.ok(Date.now() - started < 10_000, "the check waited for the server to answer");
  } finally {
    for (const socket of sockets) socket.destroy();
    silent.close();
  }
});

test("FR-QG-09 (issue 1733): missing arguments print the usage and exit 1", async () => {
  const result = await check([]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /usage: served-build\.mjs <url> <dist-index\.html>/);
});
