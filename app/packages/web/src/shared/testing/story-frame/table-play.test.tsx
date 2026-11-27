// @vitest-environment jsdom
import { composeStories, setProjectAnnotations } from "@storybook/react-vite";
import { afterEach, describe, expect, it, vi } from "vitest";
import preview from "../../../../.storybook/preview";
import * as tableStories from "@/shared/ui/table.stories";
import { unmountStoryRuns } from "../story-teardown/story-teardown";

setProjectAnnotations([preview]);
const {
  FixedHeaderAndColumn,
  FixedHeaderAndColumnAt200,
  FocusClearOfFixedCells,
  FocusClearOfFixedCellsAt200,
  FocusClearOfFixedCellsAt200W393,
} = composeStories(tableStories);

/** What a model of the layout gets wrong: the play must fail for each of them (P-B). */
type Fault = {
  /** The header row or the first column moves with the scroll, as when an ancestor scrolls and the region does not. */
  drifts?: "header" | "column";
  /** A cell that scrolls paints over the cells that stay. */
  covered?: boolean;
  /** The table fits its region, so there is nothing to scroll. */
  fits?: boolean;
  /** The cells that stay have no `position: sticky`, or a transparent surface. */
  unstuck?: boolean;
  transparent?: boolean;
  /** The region has no scroll padding for the cells that stay: a focused control is scrolled into the box only. */
  unpadded?: boolean;
  /** A loose first column (it takes more than half of the region) still sticks to the left, as when its classes do not release it. */
  looseSticks?: boolean;
};

/** What the model lays out: the width of the region and of the first column, the two numbers the table judges. */
type Setup = { width?: number; first?: number };

const REGION = { left: 16, top: 16, width: 328, height: 328 };
/** A first column of 120 px sticks in the region of 328 px (at most half); one of 200 px is loose (the table judges it, `useFirstColumn`). */
const FIRST_WIDTH = 120;
const LOOSE_FIRST_WIDTH = 200;
const CELL_WIDTH = 120;
const CELL_HEIGHT = 40;
const COLUMNS = 6;
const ROWS = 17;
/** A control (a button) in a cell: 12 px in from the cell's top left corner, 96 x 16 px: it ends beyond the region at scroll 0. */
const CONTROL = { inset: 12, width: 96, height: 16 };
/** `scroll-pr-2` in px at the default text size: 2 steps of 4 px. */
const RING_PADDING = 8;
/** Chromium treats a box of which this many px show as shown and does not scroll it sideways. */
const REVEAL_PX = 32;
/** `scroll-pt-11` in px at the default text size: 11 steps of 4 px. */
const HEAD_PADDING = 44;

const rect = (left: number, top: number, width: number, height: number) =>
  ({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
  }) as DOMRect;

const isRegion = (element: Element) => element.hasAttribute("data-scroll-region");
const isCell = (element: Element) => element.tagName === "TH" || element.tagName === "TD";

/**
 * The layout that jsdom lacks, for the table story: a region of `width` x 328 px over a table of 17 rows (40 px) and six
 * columns (the first `first` px, the others 120 px). The header row keeps its top and the first column its left while the
 * region scrolls, as `position: sticky` does, unless the first column is loose (the region says so with `data-first-col`);
 * a fault of the model breaks one rule of the play. The plays measure this model.
 */
function layout(fault: Fault = {}, { width = REGION.width, first = FIRST_WIDTH }: Setup = {}) {
  let top = 0;
  let left = 0;
  const scrollHeight = fault.fits ? 300 : ROWS * CELL_HEIGHT;
  const scrollWidth = fault.fits ? 300 : first + (COLUMNS - 1) * CELL_WIDTH;
  /** What the table judged of its first column (`useFirstColumn` reads the model's widths): it scrolls with the cells when it is loose. */
  const loose = (cell: Element) =>
    cell.closest("[data-scroll-region]")?.getAttribute("data-first-col") === "loose" &&
    !fault.looseSticks;
  const place = (cell: Element): DOMRect => {
    const row = cell.parentElement as HTMLTableRowElement;
    const r = Array.from((row.closest("table") as HTMLTableElement).rows).indexOf(row);
    const c = (cell as HTMLTableCellElement).cellIndex;
    const stays = {
      top: r === 0 && fault.drifts !== "header",
      left: c === 0 && fault.drifts !== "column" && !loose(cell),
    };
    const x = REGION.left + (c === 0 ? 0 : first + (c - 1) * CELL_WIDTH);
    return rect(
      stays.left ? REGION.left : x - left,
      stays.top ? REGION.top : REGION.top + r * CELL_HEIGHT - top,
      c === 0 ? first : CELL_WIDTH,
      CELL_HEIGHT,
    );
  };
  const z = (cell: Element) => {
    const c = (cell as HTMLTableCellElement).cellIndex;
    const r = (cell.parentElement as HTMLTableRowElement).sectionRowIndex;
    const header = cell.closest("thead") !== null;
    return header && c === 0 ? 3 : header ? 2 : c === 0 && r >= 0 ? 1 : 0;
  };
  vi.spyOn(Element.prototype, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList);
  const sizes = {
    clientHeight: REGION.height,
    clientWidth: width,
    scrollHeight,
    scrollWidth,
  };
  for (const [name, size] of Object.entries(sizes))
    vi.spyOn(Element.prototype, name as "clientHeight", "get").mockImplementation(function (
      this: Element,
    ) {
      return isRegion(this) ? size : 0;
    });
  vi.spyOn(Element.prototype, "scrollTop", "get").mockImplementation(function (this: Element) {
    return isRegion(this) ? top : 0;
  });
  vi.spyOn(Element.prototype, "scrollLeft", "get").mockImplementation(function (this: Element) {
    return isRegion(this) ? left : 0;
  });
  vi.spyOn(Element.prototype, "scrollTop", "set").mockImplementation(function (this: Element, to) {
    if (isRegion(this)) top = Math.max(0, Math.min(to, scrollHeight - REGION.height));
  });
  vi.spyOn(Element.prototype, "scrollLeft", "set").mockImplementation(function (this: Element, to) {
    if (isRegion(this)) left = Math.max(0, Math.min(to, scrollWidth - width));
  });
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    if (isRegion(this)) return rect(REGION.left, REGION.top, width, REGION.height);
    const cell = this.tagName === "BUTTON" ? this.closest("td, th") : null;
    if (cell) {
      const at = place(cell);
      return rect(at.left + CONTROL.inset, at.top + CONTROL.inset, CONTROL.width, CONTROL.height);
    }
    return isCell(this) ? place(this) : rect(0, 0, 0, 0);
  });
  // The scroll padding that the classes of the region give in a browser: the width of the first column on the left (the
  // variable the region measured; none while the column is loose), the room of a focus ring on the right and the header's
  // height on top. Chromium takes the scrollport less this padding as the room where a focused box counts as shown (measured
  // in Chromium 2026-11-27, issues 2573 and 2601).
  const padding = (region: Element) => ({
    left:
      fault.unpadded || !region.classList.contains("scroll-pl-(--table-first-col)")
        ? 0
        : parseFloat((region as HTMLElement).style.getPropertyValue("--table-first-col")) || 0,
    right: fault.unpadded || !region.classList.contains("scroll-pr-2") ? 0 : RING_PADDING,
    top: fault.unpadded || !region.classList.contains("scroll-pt-11") ? 0 : HEAD_PADDING,
  });
  // What `focus()` scrolls on one axis, for a box from `lo` to `hi` and a room from `from` to `to`: nothing for a box that
  // shows in full; sideways nothing either for a box of which `REVEAL_PX` show (Chromium takes it as shown), downwards the
  // closest edge for any part; the closest edge for a smaller part; the middle of the room for a box that is hidden.
  const reveal = (lo: number, hi: number, from: number, to: number, enough: number) => {
    const shown = Math.min(hi, to) - Math.max(lo, from);
    if (shown >= hi - lo || shown >= enough) return 0;
    if (shown > 0) return lo < from ? lo - from : hi - to;
    return (lo + hi) / 2 - (from + to) / 2;
  };
  // The browser scrolls after the focus events (the handler of the region runs first, as in Chromium).
  const focus = HTMLElement.prototype.focus;
  vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(function (
    this: HTMLElement,
    options,
  ) {
    focus.call(this, options);
    const region = this.closest("[data-scroll-region]");
    if (!region) return;
    const pad = padding(region);
    const box = this.getBoundingClientRect();
    const sideways = reveal(
      box.left,
      box.right,
      REGION.left + pad.left,
      REGION.left + width - pad.right,
      REVEAL_PX,
    );
    const down = reveal(
      box.top,
      box.bottom,
      REGION.top + pad.top,
      REGION.top + REGION.height,
      Infinity,
    );
    left = Math.max(0, Math.min(left + sideways, scrollWidth - width));
    top = Math.max(0, Math.min(top + down, scrollHeight - REGION.height));
  });
  const real = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudo) => {
    if (isRegion(element)) {
      const pad = padding(element);
      return {
        overflowX: "auto",
        overflowY: "auto",
        overscrollBehaviorY: "contain",
        scrollPaddingLeft: pad.left > 0 ? `${pad.left}px` : "auto",
        scrollPaddingRight: `${pad.right}px`,
      } as CSSStyleDeclaration;
    }
    if (!isCell(element)) return real(element, pseudo);
    const column = (element as HTMLTableCellElement).cellIndex === 0;
    const stays = element.closest("thead") !== null || column;
    return {
      position: stays && !fault.unstuck ? "sticky" : "static",
      left: column && !loose(element) ? "0px" : "auto",
      backgroundColor: fault.transparent ? "rgba(0, 0, 0, 0)" : "rgb(255, 255, 255)",
    } as CSSStyleDeclaration;
  });
  const hit = (x: number, y: number): Element | null => {
    const cells = Array.from(document.querySelectorAll("[data-scroll-region] :is(th, td)"));
    if (fault.covered) return cells.find((cell) => z(cell) === 0 && cell.closest("tbody")) ?? null;
    const at = cells.filter((cell) => {
      const box = place(cell);
      return x >= box.left && x < box.right && y >= box.top && y < box.bottom;
    });
    return at.sort((a, b) => z(b) - z(a))[0] ?? null;
  };
  Object.defineProperty(document, "elementFromPoint", { value: hit, configurable: true });
  Object.defineProperty(document, "scrollingElement", {
    value: document.documentElement,
    configurable: true,
  });
  Object.defineProperty(document, "fonts", {
    value: { ready: Promise.resolve() },
    configurable: true,
  });
}

afterEach(async () => {
  await unmountStoryRuns();
  vi.restoreAllMocks();
  for (const name of ["elementFromPoint", "scrollingElement", "fonts"])
    Reflect.deleteProperty(document, name);
});

describe("US-QS-15 · SG-LIST-01 the plays of the Table stories hold under a model of the layout", () => {
  it("US-QS-15 · SG-LIST-01 the play of the fixed header row and first column passes when they keep their place", async () => {
    layout();
    await FixedHeaderAndColumn.run();
    const region = document.querySelector("[data-scroll-region]") as HTMLElement;
    // The first column sticks (120 px of 328), and the play puts the scroll back where it found it.
    expect(region.getAttribute("data-first-col")).toBe("sticky");
    expect([region.scrollTop, region.scrollLeft]).toEqual([0, 0]);
  });

  it("US-QS-15 · DS-63 · 2.4.11 the play at 200 % text passes when only the header row stays and the first column scrolls with the cells", async () => {
    layout({}, { first: LOOSE_FIRST_WIDTH });
    await FixedHeaderAndColumnAt200.run();
    expect(document.documentElement.style.getPropertyValue("font-size")).toBe("200%");
    const region = document.querySelector("[data-scroll-region]") as HTMLElement;
    expect(region.getAttribute("data-first-col")).toBe("loose");
  });

  it("US-QS-15 · 2.4.11 the play at 200 % text fails when a loose first column still sticks to the left", async () => {
    layout({ looseSticks: true }, { first: LOOSE_FIRST_WIDTH });
    await expect(FixedHeaderAndColumnAt200.run()).rejects.toThrow(/wrong left/);
  });

  it("US-QS-15 · 2.4.11 the play fails when the table measures another first column than the story expects", async () => {
    layout({}, { first: LOOSE_FIRST_WIDTH });
    await expect(FixedHeaderAndColumn.run()).rejects.toThrow(/measures a sticky first column/);
    await unmountStoryRuns();
    vi.restoreAllMocks();
    layout();
    await expect(FixedHeaderAndColumnAt200.run()).rejects.toThrow(/measures a loose first column/);
  });

  it("US-QS-15 · SG-LIST-01 the play fails when the header row drifts with the scroll", async () => {
    layout({ drifts: "header" });
    await expect(FixedHeaderAndColumn.run()).rejects.toThrow(/drifted/);
    await unmountStoryRuns();
    vi.restoreAllMocks();
    // The header row stays at the top when the first column is loose as well.
    layout({ drifts: "header" }, { first: LOOSE_FIRST_WIDTH });
    await expect(FixedHeaderAndColumnAt200.run()).rejects.toThrow(/drifted/);
  });

  it("US-QS-15 · SG-LIST-01 the play fails when the first column drifts with the scroll", async () => {
    layout({ drifts: "column" });
    await expect(FixedHeaderAndColumn.run()).rejects.toThrow(/drifted/);
  });

  it("US-QS-15 · SG-LIST-01 the play fails when a cell that scrolls paints over a cell that stays", async () => {
    layout({ covered: true });
    await expect(FixedHeaderAndColumn.run()).rejects.toThrow(/covered by a cell that scrolls/);
  });

  it("US-QS-15 · DS-58 the play fails when the table fits its region, because it then proves nothing", async () => {
    layout({ fits: true });
    await expect(FixedHeaderAndColumn.run()).rejects.toThrow(/proves nothing/);
  });

  it("US-QS-15 · DS-61 the play fails when a cell does not stick or is not opaque", async () => {
    layout({ unstuck: true });
    await expect(FixedHeaderAndColumn.run()).rejects.toThrow(/does not stick/);
    await unmountStoryRuns();
    vi.restoreAllMocks();
    layout({ transparent: true });
    await expect(FixedHeaderAndColumn.run()).rejects.toThrow(/not opaque/);
  });
});

describe("US-QS-15 · WCAG 2.4.11 the plays of the Table stories of the focus hold under a model of the layout", () => {
  const region = () => document.querySelector("[data-scroll-region]") as HTMLElement;

  it("US-QS-15 · 2.4.11 the play of the focus passes at 100 % text when the control is brought clear of the first column, the header row and the right edge", async () => {
    layout();
    await FocusClearOfFixedCells.run();
    // The measured width of the first column is the scroll padding the model reads; the play puts the scroll back.
    expect(region().getAttribute("data-first-col")).toBe("sticky");
    expect(region().style.getPropertyValue("--table-first-col")).toBe(`${FIRST_WIDTH}px`);
    expect([region().scrollTop, region().scrollLeft]).toEqual([0, 0]);
  });

  it("US-QS-15 · DS-63 · 2.4.11 the same play passes at 200 % text, 360 px wide, with a loose first column and no padding on the left", async () => {
    layout({}, { first: LOOSE_FIRST_WIDTH });
    await FocusClearOfFixedCellsAt200.run();
    expect(document.documentElement.style.getPropertyValue("font-size")).toBe("200%");
    expect(region().getAttribute("data-first-col")).toBe("loose");
    expect(region().style.getPropertyValue("--table-first-col")).toBe("");
  });

  it("US-QS-15 · DS-63 · 2.4.11 the same play passes at 200 % text, 393 px wide", async () => {
    layout({}, { first: LOOSE_FIRST_WIDTH, width: 361 });
    await FocusClearOfFixedCellsAt200W393.run();
    expect(region().getAttribute("data-first-col")).toBe("loose");
  });

  it("US-QS-15 · 2.4.11 the play fails when the region has no scroll padding for the cells that stay", async () => {
    layout({ unpadded: true });
    await expect(FocusClearOfFixedCells.run()).rejects.toThrow(/not entirely in the room/);
  });

  it("US-QS-15 · 2.4.11 the play fails when the control does not start where the story says, because it then proves nothing", async () => {
    layout({ fits: true });
    await expect(FocusClearOfFixedCells.run()).rejects.toThrow(/proves nothing/);
  });

  it("US-QS-15 · 2.4.11 the play fails when the table measures another first column than the story expects", async () => {
    layout();
    await expect(FocusClearOfFixedCellsAt200.run()).rejects.toThrow(
      /measures a loose first column/,
    );
  });

  it("US-QS-15 · 2.4.11 the play fails when the control does not get the focus", async () => {
    layout();
    vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(() => undefined);
    await expect(FocusClearOfFixedCells.run()).rejects.toThrow(/gets the focus/);
  });
});
