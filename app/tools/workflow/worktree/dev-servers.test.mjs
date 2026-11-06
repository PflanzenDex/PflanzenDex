// US-DEV-08 (issue 904): `make dev` uses the ports and the test database of its worktree
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { busyPorts, devPlan, portFree, summaryLines, worktreePorts } from "./dev-servers.mjs";

const dir = mkdtempSync(join(tmpdir(), "pdx-dev-servers-"));
after(() => rmSync(dir, { recursive: true, force: true }));

const WORKTREE_FILE = `PFLANZENDEX_TEST_DB_PORT=54700
PFLANZENDEX_TEST_DB_NAME=pflanzendex_chore_issue_904_9c33e3
PFLANZENDEX_DEV_API_PORT=55200
PFLANZENDEX_DEV_WEB_PORT=55700
`;

function writeWorktreeFile(text) {
  const file = join(dir, `.env.worktree-${Math.random().toString(36).slice(2)}`);
  writeFileSync(file, text);
  return file;
}

test("US-DEV-08: without .env.worktree the plan is the plain command of the main checkout", () => {
  const ports = worktreePorts(join(dir, "missing", ".env.worktree"));
  assert.equal(ports, undefined);
  const plan = devPlan(ports, {});
  assert.deepEqual(plan.args, [
    "-n",
    "api,web",
    "-c",
    "blue,green",
    "npm run dev -w @pflanzendex/api",
    "npm run dev -w @pflanzendex/web",
  ]);
  assert.deepEqual(plan.variables, {});
  assert.deepEqual(plan.kept, []);
  assert.equal(plan.listen, undefined);
});

test("US-DEV-08: a worktree .env.worktree gives both servers its ports and the worktree test database", () => {
  const ports = worktreePorts(writeWorktreeFile(WORKTREE_FILE));
  assert.deepEqual(ports, { api: 55200, web: 55700, db: 54700 });
  const plan = devPlan(ports, {});
  assert.deepEqual(plan.variables, {
    PORT: "55200",
    WEB_ORIGIN: "http://localhost:55700",
    VITE_API_URL: "http://localhost:55200",
    AI_RESOURCE_URL: "http://localhost:55200/mcp",
    DATABASE_URL: "postgres://postgres:postgres@127.0.0.1:54700/pflanzendex_test",
  });
  assert.deepEqual(plan.listen, { api: 55200, web: 55700 });
  assert.ok(plan.args.includes("--kill-others-on-fail"));
  assert.equal(plan.args.at(-1), "npm run dev -w @pflanzendex/web -- --port 55700 --strictPort");
});

test("US-DEV-08: a variable already set in the environment wins over the worktree file", () => {
  const ports = worktreePorts(writeWorktreeFile(WORKTREE_FILE));
  const plan = devPlan(ports, { PORT: "4000", DATABASE_URL: "postgres://other/db" });
  assert.equal("PORT" in plan.variables, false);
  assert.equal("DATABASE_URL" in plan.variables, false);
  assert.deepEqual(plan.kept, ["PORT", "DATABASE_URL"]);
  // The API origin of the web app and the AI resource follow the port that the API really uses.
  assert.equal(plan.variables.VITE_API_URL, "http://localhost:4000");
  assert.equal(plan.variables.AI_RESOURCE_URL, "http://localhost:4000/mcp");
  assert.deepEqual(plan.listen, { api: 4000, web: 55700 });
  assert.deepEqual(summaryLines(plan), [
    "dev: worktree ports from .env.worktree: API 4000, web 55700",
    "dev: kept from the environment: PORT, DATABASE_URL",
  ]);
});

test("US-DEV-08: an empty environment variable counts as not set", () => {
  const plan = devPlan(worktreePorts(writeWorktreeFile(WORKTREE_FILE)), { PORT: "" });
  assert.equal(plan.variables.PORT, "55200");
  assert.deepEqual(plan.kept, []);
});

test("US-DEV-08: a .env.worktree without a port aborts instead of falling back to 3000", () => {
  const file = writeWorktreeFile(WORKTREE_FILE.replace(/PFLANZENDEX_DEV_API_PORT=.*\n/, ""));
  assert.throws(() => worktreePorts(file), /PFLANZENDEX_DEV_API_PORT is missing/);
});

test("US-DEV-08: the test database name is the one that make db-up creates for tests and make migrate", () => {
  const makefile = readFileSync(
    fileURLToPath(new URL("../../../../Makefile", import.meta.url)),
    "utf8",
  );
  assert.match(makefile, /POSTGRES_DB=pflanzendex_test\b/);
  const plan = devPlan({ api: 55200, web: 55700, db: 54700 }, {});
  assert.match(plan.variables.DATABASE_URL, /\/pflanzendex_test$/);
});

test("US-DEV-08: a port that another process listens on is reported busy", async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const busy = server.address().port;
  try {
    assert.equal(await portFree(busy), false);
    const free = await freePort();
    assert.equal(await portFree(free), true);
    assert.deepEqual(await busyPorts({ api: busy, web: free }), [`API ${busy}`]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
