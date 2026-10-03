import { defineConfig, devices } from "@playwright/test";

// QG-T3: core flows on a phone viewport (P-11, mobile first) and on desktop.
// Prerequisites (make e2e): Keycloak (make auth-up) and a migrated PostgreSQL; API and web are started here.
const WEB = "http://localhost:5173"; // fixed: the Keycloak realm only allows this redirect origin
const inCi = Boolean(process.env["CI"]);

export default defineConfig({
  testDir: "tests",
  outputDir: "test-results",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: inCi ? 1 : 0,
  workers: 1, // both projects share one database; every test creates its own account
  reporter: inCi
    ? [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]]
    : [["list"]],
  use: { baseURL: WEB, locale: "de-DE", trace: "retain-on-failure" },
  projects: [
    { name: "mobil", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: [
    {
      command: "npm run dev -w @pflanzendex/api",
      cwd: "../..",
      url: "http://localhost:3000/health",
      reuseExistingServer: !inCi,
      timeout: 60_000,
    },
    {
      command: "npm run dev -w @pflanzendex/web",
      cwd: "../..",
      url: WEB,
      reuseExistingServer: !inCi,
      timeout: 60_000,
    },
  ],
});
