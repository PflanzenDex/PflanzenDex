// Shared parts of the measuring tools (US-QG-01, issue 1199): where the app runs, the screen register of the one-screen
// gate, signing in through Keycloak and opening a screen the way the gate does.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
// Playwright comes from the e2e package, so the tools use the same browser build as the gate.
const require = createRequire(join(ROOT, "app/packages/e2e/package.json"));
export const { chromium } = require("@playwright/test");

/** The web app and the API to measure: `PDX_WEB` and `PDX_API`, else the dev ports of `.env.worktree`. */
export const WEB =
  process.env.PDX_WEB ?? `http://localhost:${process.env.PFLANZENDEX_DEV_WEB_PORT ?? 5173}`;
export const API =
  process.env.PDX_API ?? `http://localhost:${process.env.PFLANZENDEX_DEV_API_PORT ?? 3000}`;
/** The password of the demo users test, test2 and test3 (demo seed, docs/guides/reference/app.md). */
export const PASSWORD = process.env.PDX_PASSWORD ?? "testtest12";

/** The window sizes of US-QS-15 (issue 1160). */
export const SIZES = ["360x640", "390x844", "768x1024", "1024x768", "1920x1080", "2560x1440"];

/** The screens of the one-screen gate: id, account, path and the click steps that open a layer or dialog. */
export function register() {
  return JSON.parse(
    readFileSync(join(ROOT, "app/packages/e2e/support/display/screens.json"), "utf8"),
  );
}

/** "1024x768" as width and height. */
export function parseSize(size) {
  const [width, height] = size.split("x").map(Number);
  if (!(width > 0 && height > 0)) throw new Error(`not a size: ${size} (expected e.g. 360x640)`);
  return { width, height };
}

/** Signs in once per account and keeps the browser storage, so every screen starts signed in. */
export function sessions(browser) {
  const kept = new Map();
  return async (user) => {
    if (!kept.has(user)) {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(`${WEB}/`);
      await page
        .getByRole("button", { name: /anmelden/i })
        .first()
        .click();
      await page.fill("#username", user);
      await page.fill("#password", PASSWORD);
      await page.click("#kc-login");
      await page.waitForURL(`${WEB}/**`, { timeout: 30_000 });
      await page.waitForTimeout(1500);
      kept.set(user, await context.storageState());
      await context.close();
    }
    return kept.get(user);
  };
}

/**
 * A context for one screen: the window size, light or dark, and writes to the API blocked, so measuring never changes
 * the demo data.
 */
export async function screenContext(browser, storageState, size, dark = false) {
  const context = await browser.newContext({
    storageState,
    viewport: parseSize(size),
    colorScheme: dark ? "dark" : "light",
  });
  await context.route(`${API}/**`, (route) =>
    route.request().method() === "GET" ? route.continue() : route.abort(),
  );
  return context;
}

/** Waits until the data is there and the sheets have slid in. */
async function settle(page) {
  await page.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => undefined);
  await page
    .waitForFunction(() => !document.querySelector("[aria-busy='true']"), null, { timeout: 5000 })
    .catch(() => undefined);
  await page.waitForTimeout(900);
}

/** Opens a screen of the register: its path, then its steps (`role` with `name` or `re`, or `css` with `nth`). */
export async function openScreen(page, screen, textPercent = 100) {
  await page.goto(WEB + screen.path);
  await settle(page);
  for (const step of screen.steps ?? []) {
    const target = step.css
      ? page.locator(step.css).nth(step.nth ?? 0)
      : page
          .getByRole(
            step.role,
            step.re ? { name: new RegExp(step.re, "i") } : { name: step.name, exact: true },
          )
          .first();
    await target.click({ timeout: 10_000 });
    await settle(page);
  }
  if (textPercent !== 100) {
    await page.evaluate((p) => {
      document.documentElement.style.fontSize = `${p}%`;
    }, textPercent);
    await page.waitForTimeout(800);
  }
}
