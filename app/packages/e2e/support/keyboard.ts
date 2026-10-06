import { expect, type Locator, type Page } from "@playwright/test";
import type { TestAccount } from "./account";

// US-QS-08: keyboard-only helpers. Nothing here clicks; every step is Tab, Shift+Tab, Enter, Space, Esc or an arrow key.

const MAX_TABS = 400;

/** Presses Tab (or Shift+Tab) until `target` has the focus; fails when it is never reached (2.1.1). */
export async function tabTo(
  page: Page,
  target: Locator,
  options: { back?: boolean; max?: number } = {},
): Promise<void> {
  const key = options.back ? "Shift+Tab" : "Tab";
  for (let i = 0; i < (options.max ?? MAX_TABS); i++) {
    if (await target.evaluate((el) => el === document.activeElement).catch(() => false)) return;
    await page.keyboard.press(key);
  }
  throw new Error(`Not reachable by ${key}: ${target.toString()}`);
}

/** Tabs to `target` and presses `key` on it (Enter by default). */
export async function press(page: Page, target: Locator, key = "Enter"): Promise<void> {
  await tabTo(page, target);
  await page.keyboard.press(key);
}

/** Types into the focused field, character by character, as a keyboard does. */
export async function typeInto(page: Page, field: Locator, text: string): Promise<void> {
  await tabTo(page, field);
  await page.keyboard.type(text);
}

/** Moves a native select to the option at `index` (0 = first) with the arrow keys only. */
export async function chooseByArrows(page: Page, select: Locator, index: number): Promise<void> {
  await tabTo(page, select);
  await page.keyboard.press("Home");
  for (let i = 0; i < index; i++) await page.keyboard.press("ArrowDown");
}

/** Signs in at the sign-in service with the keyboard only. */
export async function signInByKeyboard(page: Page, account: TestAccount): Promise<void> {
  await page.goto("/");
  await press(page, page.getByRole("button", { name: "Anmelden" }));
  await expect(page.locator("#username")).toBeVisible();
  await typeInto(page, page.locator("#username"), account.email);
  await typeInto(page, page.locator("#password"), account.password);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("link", { name: "Zum Inhalt springen" })).toBeAttached();
}

/** Opens a destination of the navigation by keyboard: from the header row, or on the phone through "Mehr". */
export async function openByKeyboard(page: Page, label: string): Promise<void> {
  await page.locator("body").evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const header = page.getByRole("navigation", { name: "Hauptnavigation" }).getByRole("link", {
    name: label,
    exact: true,
  });
  const bar = page.getByRole("navigation", { name: "Navigation unten" });
  if (await header.isVisible()) return press(page, header);
  const inBar = bar.getByRole("link", { name: label, exact: true });
  if (await inBar.isVisible()) return press(page, inBar);
  await press(page, bar.getByRole("button", { name: "Mehr" }));
  const drawer = page.getByRole("dialog", { name: "Mehr" });
  await press(page, drawer.getByRole("link", { name: label, exact: true }));
  await expect(drawer).toBeHidden();
}

export interface WalkStep {
  name: string;
  /** Completely covered by the sticky header or the fixed bottom bar (2.4.11). */
  hidden: boolean;
  /** Has a visible focus indicator: an outline or a box shadow ring (2.4.7). */
  indicator: boolean;
}

/** What the focused element is, and whether a sticky part covers it completely. */
function describeFocus(): WalkStep | null {
  const el = document.activeElement as HTMLElement | null;
  if (!el || el === document.body) return null;
  const r = el.getBoundingClientRect();
  const covers = [...document.querySelectorAll<HTMLElement>("header, nav[data-bottom-bar]")]
    .filter((c) => !c.contains(el))
    .filter((c) => ["sticky", "fixed"].includes(getComputedStyle(c).position))
    .filter((c) => getComputedStyle(c).display !== "none")
    .map((c) => c.getBoundingClientRect());
  const coveredBy = (c: DOMRect) =>
    r.top >= c.top && r.bottom <= c.bottom && r.left >= c.left && r.right <= c.right;
  const offscreen = r.bottom <= 0 || r.top >= window.innerHeight;
  const style = getComputedStyle(el);
  const indicator =
    (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0) ||
    style.boxShadow !== "none";
  const label = el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 40) ?? "";
  return {
    name: `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""} "${label}"`,
    hidden: offscreen || covers.some(coveredBy),
    indicator,
  };
}

/** Every element a user can reach with Tab in the current view (visible, enabled, not inert). */
function countTabbable(): string[] {
  const selector =
    'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), ' +
    'textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';
  return [...document.querySelectorAll<HTMLElement>(selector)]
    .filter((el) => el.checkVisibility({ visibilityProperty: true }) && !el.closest("[inert]"))
    .filter((el) => el.tagName !== "SUMMARY" || el.parentElement?.tagName === "DETAILS")
    .map(
      (el) =>
        `${el.tagName.toLowerCase()} "${el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 40) ?? ""}"`,
    );
}

/**
 * Keyboard walk over the current view (US-QS-08, FR-QG-24): Tab from the top until the focus comes back to the
 * skip link. Returns the visited steps; fails on a keyboard trap (2.1.2), when an element is never reached (2.1.1) or
 * when a focused element is completely hidden (2.4.11).
 */
export async function keyboardWalk(page: Page): Promise<WalkStep[]> {
  await page.locator("body").evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.evaluate(() => window.scrollTo(0, 0));
  const steps: WalkStep[] = [];
  const skip = page.getByRole("link", { name: "Zum Inhalt springen" });
  for (let i = 0; i < MAX_TABS; i++) {
    await page.keyboard.press("Tab");
    const step = await page.evaluate(describeFocus);
    if (!step) continue;
    if (steps.length > 0 && (await skip.evaluate((el) => el === document.activeElement))) {
      const expected = await page.evaluate(countTabbable);
      expect(steps.length, `reached ${steps.length} of ${expected.length}`).toBeGreaterThanOrEqual(
        expected.length,
      );
      return steps;
    }
    steps.push(step);
  }
  throw new Error(
    `Keyboard trap: the focus did not come back to the skip link after ${MAX_TABS} Tabs; ` +
      `last: ${steps.at(-1)?.name ?? "nothing"}`,
  );
}
