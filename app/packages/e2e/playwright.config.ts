import { defineConfig, devices } from "@playwright/test";

// QG-T3: core flows on a phone viewport (P-11, mobile first) and on desktop.
// Prerequisites (make e2e): Keycloak (make auth-up) and a migrated PostgreSQL; API and web are started here.
// The Keycloak realm only allows the origin localhost:5173; a worktree with its own port adds it with
// `node tools/keycloak/web-port.mjs <port>` and sets E2E_WEB_PORT / E2E_API_PORT.
const WEB_PORT = process.env["E2E_WEB_PORT"] ?? "5173";
const API_PORT = process.env["E2E_API_PORT"] ?? "3000";
const WEB = `http://localhost:${WEB_PORT}`;
const API = `http://localhost:${API_PORT}`;
const inCi = Boolean(process.env["CI"]);
/** The specs of the read-only gates have their own projects and are not part of `make e2e` (anchored on the file name). */
const GATE_SPECS = /(one-screen|a11y-routes(-self-test)?)\.spec\.ts$/;

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
    ...(inCi ? [["html", { open: "never", outputFolder: "playwright-report" }] as const] : []),
    ["./support/display/reporter.ts"], // one-screen gate (issue 1137): merges the results of the workers; idle otherwise
    ["./support/display/a11y/reporter.ts"], // a11y-routes gate (issue 467): same, for its own project
  ],
  use: { baseURL: WEB, locale: "de-DE", trace: "retain-on-failure" },
  projects: [
    { name: "mobil", testIgnore: GATE_SPECS, use: { ...devices["Pixel 7"] } },
    { name: "desktop", testIgnore: GATE_SPECS, use: { ...devices["Desktop Chrome"] } },
    // QG-U8 (issue 1137): read-only, so several workers are safe; `make one-screen` sets --workers.
    {
      name: "one-screen",
      testMatch: /one-screen\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"] },
    },
    // QG-U7 (issue 467): axe and keyboard walk per route, read-only too; `make a11y-routes` sets --workers. The sizes are set
    // by the test itself (it resizes one page).
    {
      name: "a11y-routes",
      testMatch: /a11y-routes(-self-test)?\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"] },
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
      command: `npm run dev -w @pflanzendex/web -- --port ${WEB_PORT} --strictPort`,
      cwd: "../..",
      env: serverEnv({ VITE_API_URL: API }),
      url: WEB,
      reuseExistingServer: !inCi,
      timeout: 60_000,
    },
  ],
});
