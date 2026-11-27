import type { Locator, Page } from "@playwright/test";
import { layoutProblems } from "../display/display";
import { sizeFound } from "../display/one-screen/judge.size";
import type { Size } from "../display/one-screen/judge";
import { sizesOf } from "../display/one-screen/fit.sizes";
import { floorCheck, overflowCheck, textCheck, type Boxes, type Check } from "./check";

// The browser side of the reusable checks (US-DEV-01, issue 2504): reads what a check judges, from the page the cell shows. The
// judgement is in check.ts. Every function here reads only; none clicks or writes.

/** The boxes of named controls: the first shown match of each locator, or null when it is not shown. */
export async function boxesOf(named: Record<string, Locator>): Promise<Boxes> {
  const out: Boxes = {};
  for (const [name, locator] of Object.entries(named)) {
    const first = locator.first();
    const visible = (await first.count()) > 0 && (await first.isVisible().catch(() => false));
    const box = visible ? await first.boundingBox() : null;
    out[name] = box ? { x: box.x, y: box.y, width: box.width, height: box.height } : null;
  }
  return out;
}

/** The focused element after an action: its tag and name, `BODY` when the focus fell to the body, or null when nothing has it. */
export function focusOf(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el) return null;
    if (el === document.body) return "BODY";
    const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
    return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${text ? ` "${text}"` : ""}`;
  });
}

/** The text of every live region that holds text (the polite and the assertive one of the page, and the announcer). */
export function liveTextsOf(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("[aria-live]"))
      .map((el) => (el.textContent ?? "").trim().replace(/\s+/g, " "))
      .filter((t) => t !== ""),
  );
}

/** How many toasts are on screen: the children of the live regions of the fixed toast viewport. */
export function toastCountOf(page: Page): Promise<number> {
  return page.evaluate(() => document.querySelectorAll(".fixed [aria-live] > *").length);
}

/** The height of the page in CSS pixels (the document, not a region). */
export function pageHeightOf(page: Page): Promise<number> {
  return page.evaluate(() => (document.scrollingElement ?? document.documentElement).scrollHeight);
}

/** The root font size in px, read from the page: 16 at 100 %, 32 at 200 % (the text size of the cell). */
export function rootFontOf(page: Page): Promise<number> {
  return page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
}

/** The window the page shows: its width and height in CSS pixels. */
export function windowOf(page: Page): Promise<{ width: number; height: number }> {
  return page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
}

/**
 * The screen-level default check of every cell (US-DEV-01): horizontal overflow, the size floors of judge.size.ts, and the text
 * size of the cell. A picture, row or name below its floor fails even when nothing overflows (#2383, #2315).
 */
export async function screenChecksOf(
  page: Page,
  size: Size,
  text: "100" | "200",
): Promise<Check[]> {
  const problems = await layoutProblems(page, { skipScrollX: true });
  const sized = await sizesOf(page);
  const found = sizeFound(sized, size);
  return [overflowCheck(problems), floorCheck(found), textCheck(await rootFontOf(page), text)];
}

/** A screenshot of the window into `path` (the first screen of the cell, as the user sees it). */
export async function shotOf(page: Page, path: string): Promise<void> {
  await page.screenshot({ path, animations: "disabled" });
}
