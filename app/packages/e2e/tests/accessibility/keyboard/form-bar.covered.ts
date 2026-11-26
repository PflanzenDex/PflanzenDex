import type { Page } from "@playwright/test";
import { expect } from "../../../support/fixtures";
import { barOf, expectBarUsable } from "./form-bar.checks";

// "No fixed or sticky part lies on a control of the form" (US-QS-32, SG-SHEET-04, issue 1941), for form-bar.spec.ts: below 768 px
// the sticky bar of a page form, from 768 px the bar pinned under the scroll region of a dialog and a pane (owner decision d-115)
// and the plain row after the last field of a page form (owner decision d-060), none of which floats over a control.

/**
 * Every control of the form, one after the other: scrolled into the middle of its scroll area, the browser must hit the
 * control itself at its centre and at its corners, or a part that does not lie on it (its own parent). A fixed or sticky
 * part that lies on a control (#1941: the sticky save covered "Mehr Angaben") fails here and is named. The controls of the
 * bar are the bar's own, and the corners of a rounded control may hit what surrounds it. A control in a closed "Mehr Angaben"
 * (`details` without `open`) is not drawn, although the browser still reports a box for it: it is no control to cover.
 */
export async function expectNoControlCovered(page: Page, what: string): Promise<void> {
  const covered = await page.evaluate(() => {
    const SELECTOR = "input:not([type='hidden']), select, textarea, summary, button";
    /** The nearest fixed or sticky part around `el` that does not hold `control`; `null` when there is none. */
    const floatingAbove = (el: Element, control: Element): Element | null => {
      for (let node: Element | null = el; node; node = node.parentElement) {
        const position = getComputedStyle(node).position;
        if ((position === "fixed" || position === "sticky") && !node.contains(control)) return node;
      }
      return null;
    };
    const shown = (control: Element): boolean => {
      if (control.closest("[data-form-bar], [aria-hidden='true']")) return false;
      const closed = control.closest("details:not([open])");
      if (closed && !(control.tagName === "SUMMARY" && control.parentElement === closed))
        return false;
      const style = getComputedStyle(control);
      const box = control.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        box.width >= 8 &&
        box.height >= 8
      );
    };
    const pointsOf = (r: DOMRect): (readonly [number, number])[] => [
      [r.left + r.width / 2, r.top + r.height / 2],
      [r.left + 3, r.top + 3],
      [r.right - 3, r.top + 3],
      [r.left + 3, r.bottom - 3],
      [r.right - 3, r.bottom - 3],
    ];
    const inWindow = ([x, y]: readonly [number, number]): boolean =>
      x >= 0 && y >= 0 && x <= innerWidth && y <= innerHeight;
    const coverOf = (control: HTMLElement): string | null => {
      control.scrollIntoView({ block: "center", inline: "nearest" });
      for (const [x, y] of pointsOf(control.getBoundingClientRect()).filter(inWindow)) {
        const hit = document.elementFromPoint(x, y);
        const cover = hit && !control.contains(hit) ? floatingAbove(hit, control) : null;
        if (hit && cover)
          return `${cover.tagName.toLowerCase()}.${(cover.getAttribute("class") ?? "").split(" ").slice(0, 3).join(".")}`;
      }
      return null;
    };
    const root = document.querySelector("[role='dialog'], main") ?? document.body;
    const found: string[] = [];
    for (const control of Array.from(root.querySelectorAll<HTMLElement>(SELECTOR))) {
      if (!shown(control)) continue;
      const cover = coverOf(control);
      const label = (control.textContent || control.getAttribute("aria-label") || control.tagName)
        .trim()
        .slice(0, 30);
      if (cover) found.push(`"${label}" is covered by ${cover}`);
    }
    return found;
  });
  expect(covered, `${what}: a control lies under a fixed or sticky part`).toEqual([]);
}

/**
 * From md the pair of a page form is the form's one plain row after its last field (owner decision d-060, US-QS-32): there is one pair in the
 * page, it is reached by scrolling to it and then usable (`expectBarUsable`), it follows the last visible field in the DOM and
 * lies below it in the picture, and nothing from the bar up to the form is sticky or fixed.
 */
export async function expectBarAfterFields(page: Page, what: string): Promise<void> {
  await expect(page.locator("[data-form-bar]"), `${what}: one pair is in the page`).toHaveCount(1);
  await barOf(page).bar.scrollIntoViewIfNeeded();
  await expectBarUsable(page, what);
  const placed = await barOf(page).bar.evaluate((el) => {
    const root = el.closest("[role='dialog'], [data-layer-pane], main") ?? document.body;
    // A field in a closed "Mehr Angaben" is not drawn, although the browser still reports a box for it.
    const drawn = (field: Element) =>
      field.closest("details:not([open])") === null && field.getClientRects().length > 0;
    const fields = Array.from(
      root.querySelectorAll("input:not([type='hidden']), select, textarea"),
    );
    const last = fields.filter(drawn).pop();
    const floats = (node: Element | null): boolean =>
      node !== null &&
      node !== root &&
      (["sticky", "fixed"].includes(getComputedStyle(node).position) || floats(node.parentElement));
    return {
      afterInDom:
        !!last && (last.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) > 0,
      below: !!last && el.getBoundingClientRect().top >= last.getBoundingClientRect().bottom - 1,
      floating: floats(el),
    };
  });
  expect(placed.afterInDom, `${what}: the pair follows the last field in the DOM`).toBe(true);
  expect(placed.below, `${what}: the pair lies below the last field`).toBe(true);
  expect(placed.floating, `${what}: the pair is neither sticky nor fixed`).toBe(false);
}

/**
 * From md the pair of a dialog and of a pane is the bar of the layer, pinned under its scroll region (owner decision d-115,
 * US-QS-32): one pair is in the page, in `[data-layer-bar]` and outside the scroll region, below it in the picture, inside the
 * window (in a window of 30 rem of height and more, without scrolling) and usable; and it holds its place when the region
 * scrolls to its end, so the confirming action is always in view.
 */
export async function expectBarPinned(page: Page, what: string): Promise<void> {
  await expect(page.locator("[data-form-bar]"), `${what}: one pair is in the page`).toHaveCount(1);
  // The frame holds the layer in a window of 30 rem of height and more; below that (200 % text at 768 px) the page scrolls as
  // WCAG 1.4.10 allows, and the pair is reached by scrolling the page, not the layer.
  const tall = await page.evaluate(
    () => innerHeight >= 30 * parseFloat(getComputedStyle(document.documentElement).fontSize),
  );
  if (!tall) await barOf(page).bar.scrollIntoViewIfNeeded();
  await expectBarUsable(page, what);
  const box = () =>
    barOf(page).bar.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom) };
    });
  const before = await box();
  const placed = await barOf(page).bar.evaluate((el) => {
    const layer = el.closest("[role='dialog'], [data-layer-pane]");
    const region = layer?.querySelector("[data-scroll-region]") ?? null;
    return {
      inSlot: el.closest("[data-layer-bar]") !== null,
      outsideRegion: region !== null && !region.contains(el),
      belowRegion:
        region !== null &&
        el.getBoundingClientRect().top >= region.getBoundingClientRect().bottom - 1,
    };
  });
  expect(placed.inSlot, `${what}: the pair is in the bar of the layer`).toBe(true);
  expect(placed.outsideRegion, `${what}: the pair is no part of the scroll region`).toBe(true);
  expect(placed.belowRegion, `${what}: the pair lies below the scroll region`).toBe(true);
  // The region scrolls to its end: the bar stays where it is and stays usable.
  await page
    .locator("[role='dialog'] [data-scroll-region], [data-layer-pane] [data-scroll-region]")
    .first()
    .evaluate((region) => {
      region.scrollTop = region.scrollHeight;
    });
  expect(await box(), `${what}: the bar holds its place while the content scrolls`).toEqual(before);
  await expectBarUsable(page, `${what}, scrolled`);
}

/** The page does not scroll sideways (WCAG 1.4.10): the bar at 200 % text wraps instead of pushing the row out. */
export async function expectNoSidewaysScroll(page: Page, what: string): Promise<void> {
  const widths = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    width: document.documentElement.clientWidth,
  }));
  expect(widths.scroll, `${what}: the page scrolls sideways`).toBeLessThanOrEqual(widths.width);
}
