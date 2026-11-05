// FR-QG-09 (issue 1251): Lighthouse on the signed-in screens /today and /collection, mobile, median of 3 runs each.
// Report only: a score never fails this run. It exits 1 when a measurement could not run: a server did not start, the
// sign-in failed, a page was not its signed-in screen or a report is missing (P-10: "could not measure" is never a pass).
// One Chrome (Playwright's Chromium with a remote debugging port) carries the session. Every run signs in again first,
// because access tokens live 300 s, and Lighthouse attaches to that Chrome with --port and --disable-storage-reset.
// Lighthouse runs asynchronously: a blocking spawnSync stalls Playwright's open connection, which must answer the new tab.
// Entry: lighthouse-signed.sh. Needs Keycloak (make auth-up), the database and the demo seed, as the one-screen gate does.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  readRun,
  readScreen,
  reportName,
  RUNS_PER_SCREEN,
  runProblem,
  SCREENS,
  SIGNED_IN_ACCOUNT,
  signedInProblem,
  summarize,
} from "./lighthouse-signed.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.resolve(here, "..", "..", "app");
const webDir = path.join(app, "packages", "web");
const out = process.env["LIGHTHOUSE_SIGNED_OUT"] ?? path.join(app, ".cache", "lighthouse-signed");
// The realm allows localhost:5173 and the redirect ports of the worktrees (web-port.mjs): the same variables as the e2e tests.
const webPort = Number(process.env["E2E_WEB_PORT"] ?? 5173);
const apiPort = Number(process.env["E2E_API_PORT"] ?? 3000);
const webOrigin = `http://localhost:${webPort}`;
const apiOrigin = `http://localhost:${apiPort}`;
/** Dev realm demo password, as in support/display/one-screen/sign-in.ts. */
const PASSWORD = "testtest12";
// Playwright lives in the e2e package; its Chromium is the browser of the one-screen gate too.
const requireE2e = createRequire(path.join(app, "packages", "e2e", "package.json"));

/** Processes this run started, each in its own process group; all of them are stopped at the end. */
const started = [];
function start(name, command, args, { cwd, env = {} }) {
  const log = fs.openSync(path.join(out, `${name}.log`), "w");
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["ignore", log, log],
    detached: true,
  });
  started.push(child);
  return child;
}

function signalGroup(child, signal) {
  try {
    process.kill(-child.pid, signal);
  } catch {
    // the group is already gone
  }
}

/** SIGTERM to the group, then SIGKILL after 5 s if the leader has not exited. Waits, so nothing still writes afterwards. */
async function stopGroup(child) {
  const exited =
    child.exitCode !== null || child.signalCode !== null
      ? Promise.resolve(true)
      : new Promise((resolve) => child.once("exit", () => resolve(true)));
  signalGroup(child, "SIGTERM");
  const clean = await Promise.race([
    exited,
    new Promise((resolve) => setTimeout(() => resolve(false), 5000)),
  ]);
  if (!clean) signalGroup(child, "SIGKILL");
}

async function stopAll() {
  await Promise.all(started.map(stopGroup));
}

/** Fails when something already answers on the port: that server would be measured, not ours. */
function assertFree(port, name) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, "127.0.0.1");
    socket.once("connect", () => {
      socket.destroy();
      reject(new Error(`${name} port ${port} is already in use, another server would be measured`));
    });
    socket.once("error", () => resolve());
  });
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitFor(url, name, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`${name} did not answer at ${url} (log: ${path.join(out, `${name}.log`)})`);
}

/** The web app for the API of this run: VITE_API_URL is fixed at build time. */
function build() {
  const log = path.join(out, "build.log");
  const fd = fs.openSync(log, "w");
  const result = spawnSync("npm", ["run", "build"], {
    cwd: webDir,
    env: { ...process.env, VITE_API_URL: apiOrigin },
    stdio: ["ignore", fd, fd],
  });
  fs.closeSync(fd);
  if (result.status !== 0) throw new Error(`web build failed (log: ${log})`);
}

/**
 * Opens an address and lets the app settle: a signed-out app checks its session on load and redirects once
 * (?error=login_required), which would abort a navigation that waits for "load".
 */
async function openSettled(page, address) {
  await page.goto(address, { waitUntil: "commit" });
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
}

/** Signs in through the real sign-in page in the default context of the Chrome, then checks the session on /today. */
async function signIn(context) {
  // A fresh login every time: a previous session would skip the sign-in page, and the tokens must be new (300 s).
  await context.clearCookies();
  const page = await context.newPage();
  // Playwright waits without limit by default: a sign-in page that never shows its form must fail, not hang.
  page.setDefaultTimeout(30_000);
  try {
    await openSettled(page, `${webOrigin}/`);
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await openSettled(page, `${webOrigin}/`);
    await page
      .getByRole("button", { name: /anmelden/i })
      .first()
      .click();
    await page.locator("#username").fill(SIGNED_IN_ACCOUNT);
    await page.locator("#password").fill(PASSWORD);
    await page.locator("#kc-login").click();
    await page.waitForURL(`${webOrigin}/**`);
    const api = [];
    page.on("response", (response) =>
      api.push({ url: response.url(), statusCode: response.status() }),
    );
    await openSettled(page, `${webOrigin}/today`);
    const problem = signedInProblem({
      webOrigin,
      apiOrigin,
      screenPath: "/today",
      landed: page.url(),
      api,
    });
    if (problem) throw new Error(`sign-in failed: ${problem}`);
  } finally {
    await page.close().catch(() => undefined);
  }
}

const LIGHTHOUSE_TIMEOUT_MS = 300_000;

/** One Lighthouse run of a screen against the Chrome of this run: mobile, the categories of the start-page run. */
function lighthouse(screen, run, port) {
  const url = `${webOrigin}${screen.path}`;
  const log = path.join(out, `lighthouse-${screen.id}-${run}.log`);
  const fd = fs.openSync(log, "w");
  return new Promise((resolve, reject) => {
    const child = spawn(
      "npm",
      [
        "run",
        "--silent",
        "lighthouse",
        "--",
        url,
        `--port=${port}`,
        "--disable-storage-reset",
        "--form-factor=mobile",
        "--quiet",
        "--only-categories=performance,accessibility,best-practices,seo",
        "--output=json",
        `--output-path=${path.join(out, reportName(screen, run))}`,
      ],
      { cwd: webDir, stdio: ["ignore", fd, fd], detached: true },
    );
    const timer = setTimeout(() => {
      signalGroup(child, "SIGKILL");
      reject(new Error(`Lighthouse timed out for ${url}, run ${run} (log: ${log})`));
    }, LIGHTHOUSE_TIMEOUT_MS);
    child.once("exit", (code) => {
      clearTimeout(timer);
      fs.closeSync(fd);
      if (code === 0) resolve();
      else
        reject(new Error(`Lighthouse failed for ${url}, run ${run} (exit ${code}, log: ${log})`));
    });
  });
}

/** The profile of the Chrome. Chrome may still write for a moment, so the removal retries and never hides a result. */
function removeProfile(profile) {
  try {
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch (error) {
    console.warn(`profile not removed: ${profile} (${error.message})`);
  }
}

async function measure() {
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  await assertFree(webPort, "web");
  await assertFree(apiPort, "API");
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "lighthouse-signed-"));
  try {
    build();
    // The API of the e2e tests, with the Pokédex fetch from outside switched off as in the one-screen gate.
    start("api", "npm", ["exec", "-w", "@pflanzendex/api", "--", "tsx", "src/main.ts"], {
      cwd: app,
      env: { PORT: String(apiPort), WEB_ORIGIN: webOrigin, TAXONOMY_BUILD: "off" },
    });
    await waitFor(`${apiOrigin}/health`, "api");
    start("web", "npx", ["vite", "preview", "--port", String(webPort), "--strictPort"], {
      cwd: webDir,
    });
    await waitFor(`${webOrigin}/`, "web");

    const { chromium } = requireE2e("@playwright/test");
    const chromePath = chromium.executablePath();
    if (!fs.existsSync(chromePath))
      throw new Error(`Playwright's Chromium is missing at ${chromePath}: run make browsers`);
    const port = await freePort();
    start(
      "chrome",
      chromePath,
      [
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${profile}`,
        "--headless=new",
        "--no-sandbox",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        "--lang=de-DE",
        "about:blank",
      ],
      { cwd: out },
    );
    await waitFor(`http://127.0.0.1:${port}/json/version`, "chrome");
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    const context = browser.contexts()[0];
    for (const screen of SCREENS) {
      for (let run = 1; run <= RUNS_PER_SCREEN; run++) {
        await signIn(context);
        await lighthouse(screen, run, port);
        const problem = runProblem(readRun(out, screen, run), screen, { webOrigin, apiOrigin });
        if (problem)
          throw new Error(`${screen.path} run ${run} is not the signed-in screen: ${problem}`);
      }
    }
    const markdown = summarize(
      SCREENS.map((screen) => ({ screen, reports: readScreen(out, screen) })),
    );
    fs.writeFileSync(path.join(out, "summary.md"), `${markdown}\n`);
    console.log(markdown);
  } finally {
    await stopAll();
    removeProfile(profile);
  }
}

process.on("SIGINT", async () => {
  await stopAll();
  process.exit(130);
});
process.on("SIGTERM", async () => {
  await stopAll();
  process.exit(143);
});

const exitCode = await measure().then(
  () => 0,
  (error) => {
    console.error(`Lighthouse signed in could not measure: ${error.message}`);
    return 1;
  },
);
process.exit(exitCode);
