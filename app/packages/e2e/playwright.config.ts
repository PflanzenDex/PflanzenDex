import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";
// @ts-expect-error TS7016: clean-ports.checkout.mjs has no declaration file; its exports are typed by E2eGuard below (US-DEV-08).
import * as guard from "../../tools/workflow/worktree/clean-ports.checkout.mjs";

// The checkout check of the e2e ports (US-DEV-08, issue 2390) is plain Node code of the tools. A .d.mts beside it would be an
// unused file for knip, and config/lint/knip.json is a gate file, so its exports are typed here.
type E2eGuard = {
  E2E_CHECKED_VARIABLE: string;
  e2eServerGuard(options: { env: NodeJS.ProcessEnv; dir: string; checked: boolean }): {
    web: number;
    api: number;
  };
};
const { E2E_CHECKED_VARIABLE, e2eServerGuard } = guard as E2eGuard;

// QG-T3: core flows on a phone viewport (P-11, mobile first) and on desktop.
// Prerequisites (make e2e): Keycloak (make auth-up) and a migrated PostgreSQL; API and web are started here.
// The Keycloak realm only allows the origin localhost:5173; a worktree with its own port adds it with
// `node tools/keycloak/web-port.mjs <port>` and sets E2E_WEB_PORT / E2E_API_PORT.
// US-DEV-08 (issue 2390): the ports are E2E_WEB_PORT and E2E_API_PORT, else the keys of this worktree's .env.worktree, else
// 5173 and 3000 (the main checkout and CI). Outside CI a local run never reuses a server of another checkout: a listener of
// another checkout on one of the two ports makes the run refuse (e2eServerGuard), because Playwright would reuse it and
// report its code as this checkout's. The ports are written back to the environment, so the servers, the workers and the
// specs read the same ones. The workers load this file again and skip the check (E2E_CHECKED_VARIABLE).
const ports = e2eServerGuard({
  env: process.env,
  dir: fileURLToPath(new URL(".", import.meta.url)),
  checked: Boolean(process.env[E2E_CHECKED_VARIABLE]),
});
process.env["E2E_WEB_PORT"] = String(ports.web);
process.env["E2E_API_PORT"] = String(ports.api);
process.env[E2E_CHECKED_VARIABLE] = "1";
const WEB_PORT = String(ports.web);
const API_PORT = String(ports.api);
const WEB = `http://localhost:${WEB_PORT}`;
const API = `http://localhost:${API_PORT}`;
const inCi = Boolean(process.env["CI"]);
// US-DEV-01 (issue 2504): one run folder per `make device-check` run, set before the workers start (they inherit it).
if (!process.env["DEVICE_CHECK_RUN_DIR"]) {
  const started = new Date().toISOString().replace(/[:.]/g, "-");
  process.env["DEVICE_CHECK_RUN_DIR"] = fileURLToPath(
    new URL(`./device-check-report/${started}/`, import.meta.url),
  );
  process.env["DEVICE_CHECK_RUN_DIR"] = process.env["DEVICE_CHECK_RUN_DIR"].replace(/\/$/, "");
}
// US-QG-01 (issue 1680): the UI gates (E2E_WEB_BUILD=1, set by their npm scripts) run against the production build under
// `vite preview`, as users get it: the dev server serves every module on its own and shares the CPU of a CI runner with
// the tests. The build takes about a second. `make e2e` keeps the dev server.
const webBuild = process.env["E2E_WEB_BUILD"] === "1";
/** The specs of the read-only gates and of the device check have their own projects and are not part of `make e2e` (anchored on the file name). */
const GATE_SPECS =
  /(one-screen|merge-shards|touched-screens|selection|a11y-routes(-self-test)?|display-checks\.device(\.self|\.self-checks|\.self-summary)?)\.spec\.ts$/;
// US-QG-01 (issue 2429): the browser of the two UI gates runs in the pinned Playwright container. dev-servers.gate-browser.mjs
// starts it and sets PW_GATE_WS to its WebSocket address; `exposeNetwork` lets that browser reach the web and API ports of this
// machine on the loopback (localhost:<port>). Without PW_GATE_WS (UI_GATES_HOST=1, the host Chromium: informational) the
// projects run the host browser, as `make e2e` does.
const GATE_CONNECT = process.env["PW_GATE_WS"]
  ? {
      connectOptions: {
        wsEndpoint: process.env["PW_GATE_WS"],
        exposeNetwork: "<loopback>",
      },
    }
  : {};

/** The environment of a server: the current one plus these variables (a given `env` replaces the whole environment). */
const serverEnv = (extra: Record<string, string>): Record<string, string> =>
  Object.fromEntries(
    Object.entries({ ...process.env, ...extra }).filter(
      (e): e is [string, string] => e[1] !== undefined,
    ),
  );

export default defineConfig({
  testDir: "tests",
  outputDir: "test-results",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: inCi ? 1 : 0,
  workers: 1, // both projects share one database; every test creates its own account
  reporter: [
    ["list"],
    ["./support/device-check/report.ts"], // US-DEV-01 (issue 2504): the summary of a device-check run; idle for the other gates
    ...(inCi ? [["html", { open: "never", outputFolder: "playwright-report" }] as const] : []),
    ["./support/display/reporter.ts"], // one-screen gate (issue 1137): merges the results of the workers; idle otherwise
    ["./support/display/a11y/reporter.ts"], // a11y-routes gate (issue 467): same, for its own project
  ],
  use: { baseURL: WEB, locale: "de-DE", trace: "retain-on-failure" },
  projects: [
    { name: "mobil", testIgnore: GATE_SPECS, use: { ...devices["Pixel 7"] } },
    { name: "desktop", testIgnore: GATE_SPECS, use: { ...devices["Desktop Chrome"] } },
    // QG-U8 (issue 1137): read-only, so several workers are safe; `make one-screen` sets --workers. Each gate has its own
    // output folder: Playwright clears the output folder of a run, and `make ui-gates` runs both gates in one CI job (US-QG-01).
    // The self-tests of the shards of the UI gates (merge-shards.spec.ts, US-QG-01) run here too.
    {
      name: "one-screen",
      testMatch: /(one-screen|merge-shards|touched-screens|selection)\.spec\.ts$/,
      outputDir: "test-results/one-screen",
      use: { ...devices["Desktop Chrome"], ...GATE_CONNECT },
    },
    // QG-U7 (issue 467): axe and keyboard walk per route, read-only too; `make a11y-routes` sets --workers. The sizes are set
    // by the test itself (it resizes one page).
    {
      name: "a11y-routes",
      testMatch: /a11y-routes(-self-test)?\.spec\.ts$/,
      outputDir: "test-results/a11y-routes",
      use: { ...devices["Desktop Chrome"], ...GATE_CONNECT },
    },
    // US-DEV-01 (issue 2504): `make device-check` (the parametrized device check, not a CI gate). Its run folder is named once here,
    // before the workers start, so every cell writes into the same device-check-report/<timestamp>/ folder.
    {
      name: "device-check",
      testMatch: /display-checks\.device(\.self|\.self-checks|\.self-summary)?\.spec\.ts$/,
      outputDir: "test-results/device-check",
      use: { ...devices["Desktop Chrome"], ...GATE_CONNECT },
    },
  ],
  webServer: [
    {
      // no `tsx watch`: a restart in the middle of a run would kill the API under test
      command: "npm exec -w @pflanzendex/api -- tsx src/main.ts",
      cwd: "../..",
      env: serverEnv({ PORT: API_PORT, WEB_ORIGIN: WEB }),
      url: `${API}/health`,
      reuseExistingServer: !inCi,
      timeout: 60_000,
    },
    {
      command: webBuild
        ? `npm run build -w @pflanzendex/web && npm exec -w @pflanzendex/web -- vite preview --port ${WEB_PORT} --strictPort`
        : `npm run dev -w @pflanzendex/web -- --port ${WEB_PORT} --strictPort`,
      cwd: "../..",
      env: serverEnv({ VITE_API_URL: API }),
      url: WEB,
      reuseExistingServer: !inCi,
      timeout: 60_000,
    },
  ],
});
