import type { Page } from "@playwright/test";
import { expect } from "../../../support/fixtures";
import { barOf, expectBarUsable } from "./form-bar.checks";

// "No fixed or sticky part lies on a control of the form" (US-QS-32, SG-SHEET-04, issue 1941), for form-bar.spec.ts: below 768 px
// the sticky bar of a page form, from 768 px (owner decision d-060) the plain row after the last field, which floats over nothing.

/**
 * Every control of the form, one after the other: scrolled into the middle of its scroll area, the browser must hit the
 * control itself at its centre and at its corners, or a part that does not lie on it (its own parent). A fixed or sticky
 * part that lies on a control (#1941: the sticky save covered "Mehr Angaben") fails here and is named. The controls of the
 * bar are the bar's own, and the corners of a rounded control may hit what surrounds it.
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
 * From md the pair is the form's one plain row after its last field (owner decision d-060, US-QS-32): there is one pair in the
 * page, it is reached by scrolling to it and then usable (`expectBarUsable`), it follows the last visible field in the DOM and
 * lies below it in the picture, and nothing from the bar up to the form is sticky or fixed.
 */
export async function expectBarAfterFields(page: Page, what: string): Promise<void> {
  await expect(page.locator("[data-form-bar]"), `${what}: one pair is in the page`).toHaveCount(1);
  await barOf(page).bar.scrollIntoViewIfNeeded();
  await expectBarUsable(page, what);
  const placed = await barOf(page).bar.evaluate((el) => {
    const root = el.closest("[role='dialog'], [data-layer-pane], main") ?? document.body;
    const fields = Array.from(
      root.querySelectorAll("input:not([type='hidden']), select, textarea"),
    );
    const last = fields.filter((field) => field.getClientRects().length > 0).pop();
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
