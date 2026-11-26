import type { Locator, Page } from "@playwright/test";
import { expect } from "../../../support/fixtures";

// The checks of the form bar on a phone (US-QS-32, SG-SHEET-04, SG-FORM-02, SG-TOUCH-01, SG-COLOR-06), shared by form-bar.spec.ts.
// They measure what the browser lays out: the bar's confirming action is visible, nothing fixed or sticky covers a control, and
// with the keyboard's height taken from the window the action and the focused field are inside it and do not overlap. From 768 px
// the pinned pair (d-115) and the plain row after the last field (d-060) are checked in form-bar.covered.ts.

/** The window sizes of the phones of the design review: iPhone 16, OnePlus 15R (assumed) and the large phone (emulated). */
export const PHONES = [
  { width: 393, height: 852 },
  { width: 424, height: 933 },
  { width: 430, height: 932 },
] as const;

/** The windows from md (owner decisions d-060 and d-115): the dialog from 768 px, the pane from 1024 px, and a wide desktop. */
export const WIDE_WINDOWS = [
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1280, height: 800 },
] as const;

/** The text sizes (the default and 200 %) and the colour schemes of the check. */
export const TEXT_SIZES = [100, 200] as const;
export const SCHEMES = ["light", "dark"] as const;

/** A numeric box in window coordinates. */
type Box = { left: number; top: number; right: number; bottom: number };

/**
 * The text size of the page, set before it loads (`addInitScript`) and read from `localStorage` on every load, so one
 * script serves every size of a test: the first layout already uses it, as the browser's own text size is.
 */
export async function textSizeBeforeLoad(page: Page): Promise<void> {
  await page.addInitScript(() => {
    new MutationObserver((_, observer) => {
      if (!document.head) return;
      const percent = Number(localStorage.getItem("e2e-text-percent") ?? "100");
      if (percent !== 100) {
        const style = document.createElement("style");
        style.textContent = `html { font-size: ${percent}% !important; }`;
        document.head.append(style);
      }
      observer.disconnect();
    }).observe(document, { childList: true, subtree: true });
  });
}

/** Sets the size, the scheme and the text size of the next load. */
export async function setLook(
  page: Page,
  look: { width: number; height: number; text: number; scheme: "light" | "dark" },
): Promise<void> {
  await page.setViewportSize({ width: look.width, height: look.height });
  await page.emulateMedia({ colorScheme: look.scheme });
  await page.evaluate((text) => localStorage.setItem("e2e-text-percent", String(text)), look.text);
}

/** The box of an element now. */
async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`no box for ${locator.toString()}`);
  return { left: box.x, top: box.y, right: box.x + box.width, bottom: box.y + box.height };
}

/** Waits until the element holds its place (a sheet slides in for about 320 ms; a page settles after its data). */
export async function holdsPlace(locator: Locator): Promise<void> {
  await expect(locator).toBeVisible();
  let last = "";
  await expect
    .poll(async () => {
      const now = JSON.stringify(await boxOf(locator));
      const same = now === last;
      last = now;
      return same;
    })
    .toBe(true);
}

const overlap = (a: Box, b: Box): boolean =>
  a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;

/** The bar of the form and its confirming action (the last button of the bar). */
export function barOf(page: Page): { bar: Locator; confirm: Locator; cancel: Locator } {
  const bar = page.locator("[data-form-bar]").first();
  return {
    bar,
    cancel: bar.getByRole("button").first(),
    confirm: bar.getByRole("button").last(),
  };
}

/**
 * The bar shows "Abbrechen" before the confirming action, both with a hit area of 44 px, and the action is inside the
 * window and is what the browser hits at its centre (nothing sticky or fixed lies on it).
 */
export async function expectBarUsable(page: Page, what: string): Promise<void> {
  const { bar, cancel, confirm } = barOf(page);
  const window = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  // A sheet slides in from below the window and its bar rests there until it starts to move: wait until it has come up.
  await expect
    .poll(async () => (await boxOf(bar)).bottom <= window.h + 0.5, {
      message: `${what}: the bar comes inside the window`,
    })
    .toBe(true);
  await holdsPlace(bar);
  await expect(cancel, `${what}: Abbrechen`).toHaveText("Abbrechen");
  for (const [name, button] of [
    ["Abbrechen", cancel],
    ["the confirming action", confirm],
  ] as const) {
    await expect(button, `${what}: ${name} is visible`).toBeVisible();
    const box = await boxOf(button);
    expect(box.bottom - box.top, `${what}: ${name} keeps 44 px`).toBeGreaterThanOrEqual(43.5);
    expect(box.left, `${what}: ${name} inside the window`).toBeGreaterThanOrEqual(-0.5);
    expect(box.right, `${what}: ${name} inside the window`).toBeLessThanOrEqual(window.w + 0.5);
    expect(box.top, `${what}: ${name} inside the window`).toBeGreaterThanOrEqual(-0.5);
    expect(box.bottom, `${what}: ${name} inside the window`).toBeLessThanOrEqual(window.h + 0.5);
  }
  const covered = await confirm.evaluate((el) => {
    // An action that cannot be pressed yet (nothing changed) takes no pointer events, and the browser would look through it
    // at what lies beneath: the check asks as if it took them.
    const own = el.style.pointerEvents;
    el.style.pointerEvents = "auto";
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    el.style.pointerEvents = own;
    return hit === null || !el.contains(hit);
  });
  expect(covered, `${what}: something lies on the confirming action`).toBe(false);
  const cancelBox = await boxOf(cancel);
  const confirmBox = await boxOf(confirm);
  expect(
    cancelBox.top < confirmBox.top || cancelBox.left < confirmBox.left,
    `${what}: Abbrechen leads the confirming action`,
  ).toBe(true);
  expect(overlap(cancelBox, confirmBox), `${what}: the two buttons overlap`).toBe(false);
}

/** The open layer or, without one, the page's main region: where the form is. */
async function formRoot(page: Page): Promise<Locator> {
  const layer = page.locator("[role='dialog']").first();
  return (await layer.count()) > 0 ? layer : page.locator("main").first();
}

/** The first field of the form: where the keeper's finger lands. */
async function firstField(page: Page): Promise<Locator> {
  return (await formRoot(page))
    .locator("input:not([type='hidden']):visible, select:visible, textarea:visible")
    .first();
}

/** Whether the field is inside the visible part of the scroll region of its layer: below it, nobody sees it (a page form has none). */
const insideItsRegion = (field: Locator): Promise<boolean> =>
  field.evaluate((el) => {
    const region = el.closest("[data-scroll-region]")?.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    return !region || (box.top >= region.top - 0.5 && box.bottom <= region.bottom + 0.5);
  });

/**
 * The keyboard case (SG-FORM-02, WCAG 2.4.11): a field has the focus and the keyboard takes the window down to 354 px (the
 * emulation shrinks the window to the visual viewport a real keyboard leaves). The browser scrolls the focused field into view
 * in the layout that is there, and a sheet needs a moment for its new one (its height slides, its grabber drops), so the field
 * takes the focus again until the layout holds (issue 2535). Action and field are then inside the window, the field inside
 * its scroll region, and apart.
 */
export async function expectKeyboardCase(
  page: Page,
  phone: { width: number },
  what: string,
): Promise<void> {
  const field = await firstField(page);
  await field.focus();
  await page.setViewportSize({ width: phone.width, height: 354 });
  const { bar, confirm } = barOf(page);
  await holdsPlace(bar);
  await expect(confirm, `${what}: the confirming action is visible`).toBeVisible();
  await expect(field, `${what}: the focused field is visible`).toBeVisible();
  await expect
    .poll(
      async () => {
        await field.blur();
        await field.focus();
        const a = await boxOf(confirm);
        const b = await boxOf(field);
        const inside = (box: Box) => box.top >= -0.5 && box.bottom <= 354.5;
        return {
          confirmInside: inside(a),
          fieldInside: inside(b),
          fieldInRegion: await insideItsRegion(field),
          overlapping: overlap(a, b),
        };
      },
      {
        message: `${what}: with the keyboard open the action and the field stay apart in the window`,
      },
    )
    .toEqual({ confirmInside: true, fieldInside: true, fieldInRegion: true, overlapping: false });
}
