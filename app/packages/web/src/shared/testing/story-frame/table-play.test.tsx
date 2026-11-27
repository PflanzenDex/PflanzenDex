// @vitest-environment jsdom
import { composeStories, setProjectAnnotations } from "@storybook/react-vite";
import { afterEach, describe, expect, it, vi } from "vitest";
import preview from "../../../../.storybook/preview";
import * as tableStories from "@/shared/ui/table.stories";
import { unmountStoryRuns } from "../story-teardown/story-teardown";

setProjectAnnotations([preview]);
const { FixedHeaderAndColumn, FixedHeaderAndColumnAt200 } = composeStories(tableStories);

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
};

const REGION = { left: 16, top: 16, width: 328, height: 328 };
const FIRST_WIDTH = 120;
const CELL_WIDTH = 100;
const CELL_HEIGHT = 40;
const COLUMNS = 6;
const ROWS = 17;

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
 * The layout that jsdom lacks, for the table story: a region of 328 x 328 px over a table of 17 rows (40 px) and six columns
 * (the first 120 px, the others 100 px). The header row keeps its top and the first column its left while the region
 * scrolls, as `position: sticky` does; a fault of the model breaks one rule of the play. The plays measure this model.
 */
function layout(fault: Fault = {}) {
  let top = 0;
  let left = 0;
  const scrollHeight = fault.fits ? 300 : ROWS * CELL_HEIGHT;
  const scrollWidth = fault.fits ? 300 : FIRST_WIDTH + (COLUMNS - 1) * CELL_WIDTH;
  const place = (cell: Element): DOMRect => {
    const row = cell.parentElement as HTMLTableRowElement;
    const r = Array.from((row.closest("table") as HTMLTableElement).rows).indexOf(row);
    const c = (cell as HTMLTableCellElement).cellIndex;
    const stays = {
      top: r === 0 && fault.drifts !== "header",
      left: c === 0 && fault.drifts !== "column",
    };
    const x = REGION.left + (c === 0 ? 0 : FIRST_WIDTH + (c - 1) * CELL_WIDTH);
    return rect(
      stays.left ? REGION.left : x - left,
      stays.top ? REGION.top : REGION.top + r * CELL_HEIGHT - top,
      c === 0 ? FIRST_WIDTH : CELL_WIDTH,
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
    clientWidth: REGION.width,
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
    if (isRegion(this)) left = Math.max(0, Math.min(to, scrollWidth - REGION.width));
  });
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    if (isRegion(this)) return rect(REGION.left, REGION.top, REGION.width, REGION.height);
    return isCell(this) ? place(this) : rect(0, 0, 0, 0);
  });
  const real = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudo) => {
    if (isRegion(element))
      return {
        overflowX: "auto",
        overflowY: "auto",
        overscrollBehaviorY: "contain",
      } as CSSStyleDeclaration;
    if (!isCell(element)) return real(element, pseudo);
    const stays =
      element.closest("thead") !== null || (element as HTMLTableCellElement).cellIndex === 0;
    return {
      position: stays && !fault.unstuck ? "sticky" : "static",
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
    // The play puts the scroll back where it found it.
    expect([region.scrollTop, region.scrollLeft]).toEqual([0, 0]);
  });

  it("US-QS-15 · DS-63 the same play passes at 200 % text, which the story sets on the page", async () => {
    layout();
    await FixedHeaderAndColumnAt200.run();
    expect(document.documentElement.style.getPropertyValue("font-size")).toBe("200%");
  });

  it("US-QS-15 · SG-LIST-01 the play fails when the header row drifts with the scroll", async () => {
    layout({ drifts: "header" });
    await expect(FixedHeaderAndColumn.run()).rejects.toThrow(/drifted/);
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
