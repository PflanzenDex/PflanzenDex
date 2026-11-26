import { vi } from "vitest";

/**
 * jsdom has no layout, so the tests of the sheet heights (US-QS-15) give it one. `header` is the height of the sheet's
 * header (handle, title row, description) and `content` the height of what the body holds. A sheet is as high as the
 * `--sheet-height` of its style says; with `auto` it is as high as header, content and the actions that stay below it (`pinned`), up
 * to its `--sheet-max`. The body shows what
 * the sheet leaves it and overflows by the rest, as a scroll region does.
 */
export const layout = { header: 90, content: 200, pinned: 0 };

const sheetOf = (el: Element): HTMLElement | null => el.closest<HTMLElement>("[data-sheet-height]");

/** What the sheet sets for its height (`--sheet-height`, `--sheet-max`): its classes read these two CSS variables. */
export const heightOf = (sheet: HTMLElement): string =>
  sheet.style.getPropertyValue("--sheet-height");
export const maxOf = (sheet: HTMLElement): string => sheet.style.getPropertyValue("--sheet-max");

/** The height of a sheet in px, from its variables and the fake layout;. */
function sheetPx(sheet: HTMLElement): number {
  const set = parseFloat(heightOf(sheet));
  if (!Number.isNaN(set)) return set;
  const max = parseFloat(maxOf(sheet));
  const natural = layout.header + layout.content + layout.pinned;
  return Number.isNaN(max) ? natural : Math.min(natural, max);
}

/** Gives the sheet, its header and its body the sizes of `layout`; undone by `vi.restoreAllMocks()`. */
export function stubSheetLayout(): void {
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.hasAttribute("data-sheet-height")) return sheetPx(this);
    if (this.hasAttribute("data-sheet-pinned")) return layout.pinned;
    return this.hasAttribute("data-sheet-header") ? layout.header : 0;
  });
  vi.spyOn(Element.prototype, "scrollHeight", "get").mockImplementation(function (this: Element) {
    return scrolls(this) ? layout.content : 0;
  });
  vi.spyOn(Element.prototype, "clientHeight", "get").mockImplementation(function (this: Element) {
    const sheet = scrolls(this) ? sheetOf(this) : null;
    return sheet ? Math.min(layout.content, sheetPx(sheet) - layout.header - layout.pinned) : 0;
  });
}

/** The region that holds the content: the body of the sheet, or the region of a layer inside it (the body then shows no overflow). */
function scrolls(el: Element): boolean {
  if (el.matches("[data-layer-body] > [data-scroll-region]")) return true;
  return el.hasAttribute("data-sheet-body") && el.querySelector("[data-layer-body]") === null;
}

/**
 * Boxes: the sheet (its height) and its handle (44 px), which the plays of the stories measure; a scroll region ends at 400 px. Every element has a client rect, so
 * `hasLayout` of the plays is true.
 */
export function stubBoxes(): void {
  const rect = (bottom: number, height = 0) =>
    ({ top: 0, left: 0, right: 0, width: 0, height, x: 0, y: 0, bottom }) as DOMRect;
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    if (this.hasAttribute("data-sheet-height")) return rect(0, sheetPx(this as HTMLElement));
    if (this.hasAttribute("data-sheet-handle")) return rect(0, 44);
    return rect(this.hasAttribute("data-scroll-region") ? 400 : 0);
  });
  vi.spyOn(Element.prototype, "getClientRects").mockImplementation(function (this: Element) {
    return [this.getBoundingClientRect()] as unknown as DOMRectList;
  });
}

/** The height of the visible window, as `visualViewport` or `innerHeight` give it; tells the sheet by a resize event. */
export function setWindowHeight(height: number): void {
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
  window.dispatchEvent(new Event("resize"));
}
