// `make dev` (US-DEV-08, issue 904): starts the API and the web app with concurrently.
// In a worktree, `.env.worktree` at the worktree root (written by worktree-env.mjs) gives both servers the ports of that
// worktree and its test database. A variable already set in the environment wins over the file. Without the file (the
// main checkout) the two commands run exactly as before: no variables, no port flags.
// Usage: npm run dev   (in app/, as `make dev` does)
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { envValue } from "../../keycloak/dev-env.mjs";
import { parsePort } from "../../keycloak/web-port.mjs";

const here = dirname(fileURLToPath(import.meta.url));
// tools/workflow/worktree -> tools/workflow -> tools -> app -> worktree root
export const WORKTREE_ENV_FILE = join(resolve(here, "..", "..", "..", ".."), ".env.worktree");

const PORT_KEYS = {
  api: "PFLANZENDEX_DEV_API_PORT",
  web: "PFLANZENDEX_DEV_WEB_PORT",
  db: "PFLANZENDEX_TEST_DB_PORT",
};
const CONCURRENTLY_BASE = ["-n", "api,web", "-c", "blue,green"];
const API_COMMAND = "npm run dev -w @pflanzendex/api";
const WEB_COMMAND = "npm run dev -w @pflanzendex/web";

/** The ports of a worktree from its `.env.worktree`; undefined when there is no file (main checkout). */
export function worktreePorts(file = WORKTREE_ENV_FILE) {
  if (!existsSync(file)) return undefined;
  const ports = {};
  for (const [name, key] of Object.entries(PORT_KEYS)) {
    const value = envValue(file, key);
    if (value === undefined)
      throw new Error(`${key} is missing in ${file}; the file is written by make worktree`);
    ports[name] = parsePort(value);
  }
  return ports;
}

/**
 * The plan for concurrently: its arguments, the variables to add for the child processes, the variables the environment
 * already set (kept) and the ports the launcher checks before it starts. The test database is the one that `make db-up`
 * creates (`POSTGRES_DB=pflanzendex_test`) and that `make migrate` and the tests use.
 */
export function devPlan(ports, env = process.env) {
  if (!ports) {
    return {
      args: [...CONCURRENTLY_BASE, API_COMMAND, WEB_COMMAND],
      variables: {},
      kept: [],
      listen: undefined,
    };
  }
  const apiPort = env["PORT"] || String(ports.api);
  const derived = {
    PORT: apiPort,
    WEB_ORIGIN: `http://localhost:${ports.web}`,
    VITE_API_URL: `http://localhost:${apiPort}`,
    AI_RESOURCE_URL: `http://localhost:${apiPort}/mcp`,
    DATABASE_URL: `postgres://postgres:postgres@127.0.0.1:${ports.db}/pflanzendex_test`,
  };
  const variables = {};
  const kept = [];
  for (const [key, value] of Object.entries(derived)) {
    if (env[key]) kept.push(key);
    else variables[key] = value;
  }
  return {
    args: [
      ...CONCURRENTLY_BASE,
      "--kill-others-on-fail",
      API_COMMAND,
      `${WEB_COMMAND} -- --port ${ports.web} --strictPort`,
    ],
    variables,
    kept,
    listen: { api: Number(apiPort), web: ports.web },
  };
}

/** True when nothing listens on the port. The servers bind to all addresses, so the check does too. */
export function portFree(port) {
  return new Promise((resolveFree) => {
    const server = createServer();
    server.once("error", () => resolveFree(false));
    server.once("listening", () => server.close(() => resolveFree(true)));
    server.listen(port);
  });
}

/** The busy ports of a plan, named for the message ("API 55200"); empty when all are free. */
export async function busyPorts(listen) {
  const checks = [
    ["API", listen.api],
    ["web", listen.web],
  ];
  const free = await Promise.all(checks.map(([, port]) => portFree(port)));
  return checks.filter((_, i) => !free[i]).map(([name, port]) => `${name} ${port}`);
}

/** Lines that tell the person which ports and variables a worktree run uses. */
export function summaryLines(plan) {
  const lines = [
    `dev: worktree ports from .env.worktree: API ${plan.listen.api}, web ${plan.listen.web}`,
  ];
  if (plan.kept.length) lines.push(`dev: kept from the environment: ${plan.kept.join(", ")}`);
  return lines;
}

/** Runs concurrently with the given arguments and variables; resolves to its exit code. */
export function runConcurrently(args, variables) {
  const require = createRequire(import.meta.url);
  const bin = join(
    dirname(require.resolve("concurrently/package.json")),
    "dist",
    "bin",
    "index.js",
  );
  return new Promise((resolveExit, reject) => {
    const child = spawn(process.execPath, [bin, ...args], {
      env: { ...process.env, ...variables },
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => resolveExit(signal ? 1 : (code ?? 1)));
  });
}

async function main() {
  const ports = worktreePorts();
  const plan = devPlan(ports, process.env);
  if (ports) {
    for (const line of summaryLines(plan)) console.log(line);
    const busy = await busyPorts(plan.listen);
    if (busy.length)
      throw new Error(
        `port in use: ${busy.join(", ")}. Stop the process that holds it (ss -ltnp shows it); the ports come from ${WORKTREE_ENV_FILE}`,
      );
  }
  return runConcurrently(plan.args, plan.variables);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
    .then((code) => process.exit(code))
    .catch((e) => {
      console.error(`dev: ${e.message}`);
      process.exit(1);
    });
}
