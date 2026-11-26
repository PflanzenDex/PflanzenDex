import type { Browser, BrowserContext, Page } from "@playwright/test";
import type { SignedInState } from "../display/one-screen/sign-in";
import { PASSWORD } from "../display/one-screen/sign-in";
import { emulatedOf, type Cell, type Device } from "./device";

// Opening one cell on an emulated device (US-DEV-01, issue 2504): a context with the device's viewport, user agent, scale and
// touch, the theme, and the text size set before the page loads (PF-038: a size set after load races the app's ResizeObserver).

/** The root font size of 200 % text, set on the element before the first script runs (WCAG 1.4.4; the text size of the cell). */
export const TEXT_200_SCRIPT = `(() => {
  const set = () => document.documentElement.style.setProperty("font-size", "200%", "important");
  if (document.documentElement) set();
  else
    new MutationObserver((_, observer) => {
      if (document.documentElement) {
        set();
        observer.disconnect();
      }
    }).observe(document, { childList: true });
})();`;

/** The page-level settings of a cell that a context does not hold: the text size (before load) and the media (forced colors). */
export async function applyPageSettings(
  page: Page,
  cell: Cell,
  emulateTheme = true,
): Promise<void> {
  if (cell.text === "200") await page.addInitScript(TEXT_200_SCRIPT);
  await page.emulateMedia({
    ...(emulateTheme ? { colorScheme: cell.theme } : {}),
    forcedColors: cell.forced ? "active" : "none",
  });
}

/**
 * Signs in through the real sign-in page when the page shows the sign-in button, as the one-screen gate does (the same steps).
 * The phone keeps its cookies between cells, so this runs once per account; the caller clears the session for another one.
 */
export async function signInOnPage(page: Page, base: string, account: string): Promise<void> {
  if (account === "anon") return;
  await page.goto(`${base}/`);
  const signIn = page.getByRole("button", { name: /anmelden/i }).first();
  const shell = page.locator("#inhalt");
  // The sign-in button or the app shell, whichever the page shows: a page still loading its redirect is waited for, never skipped.
  await signIn.or(shell).first().waitFor({ state: "visible", timeout: 20_000 });
  if (await shell.isVisible()) return;
  // Every step has its own time limit: the actions of this run have none by default, and a click the phone's keyboard covers
  // would hang the cell until the test timeout. Enter submits the Keycloak form.
  await signIn.click({ timeout: 15_000 });
  await page.locator("#username").fill(account, { timeout: 15_000 });
  await page.locator("#password").fill(PASSWORD, { timeout: 15_000 });
  await page.locator("#password").press("Enter", { timeout: 15_000 });
  // Signed in only when the app shell shows: a return to the welcome page is no sign-in.
  await shell.waitFor({ state: "visible", timeout: 30_000 });
}

/** Options of the context of an emulated device: viewport, scale, user agent, touch, locale and the theme of the cell. */
export function contextOptionsOf(device: Device, cell: Cell, state?: SignedInState) {
  return {
    locale: "de-DE",
    viewport: { width: device.width, height: device.height },
    deviceScaleFactor: device.deviceScaleFactor,
    userAgent: device.userAgent,
    isMobile: true,
    hasTouch: true,
    colorScheme: cell.theme,
    ...(state ? { storageState: state } : {}),
  };
}

/** A context and a page of an emulated cell, with the page settings applied before its first navigation. */
export async function openEmulated(
  browser: Browser,
  cell: Cell,
  state?: SignedInState,
): Promise<{ context: BrowserContext; page: Page; device: Device }> {
  const device = emulatedOf(cell.device);
  if (!device) throw new Error(`device-check: ${cell.device} is not an emulated device`);
  const context = await browser.newContext(contextOptionsOf(device, cell, state));
  const page = await context.newPage();
  await applyPageSettings(page, cell);
  return { context, page, device };
}
