import { check, hasLayout, must, waitUntil } from "./story-play";

/**
 * The play of the stories of the table that keeps its header row and its first column (US-QS-15, SG-LIST-01, DS-58, DS-61;
 * matrix row 22 of the scroll gates spike, issue 2420). It scrolls the table region down and sideways and measures the boxes:
 * the header row and the first column drift 0 px against the region, a plain cell scrolls with it, no cell that scrolls
 * shows over a cell that stays, and neither the frame nor the page scrolls. A play measures only where there is layout (the
 * browser run of the conformance, 360 x 640 px); the jsdom run of the stories returns before the first measure.
 */
type Box = { top: number; left: number; right: number; bottom: number };

/** Below this, a box has not drifted: layout rounds a box to a fraction of a pixel. */
const DRIFT_PX = 0.5;
/** How far the play scrolls the region, down and sideways. */
const SCROLL_PX = 140;

export const boxOf = (element: Element): Box => {
  const { top, left, right, bottom } = element.getBoundingClientRect();
  return { top, left, right, bottom };
};

/** Where a cell stands in its region: the distance of its box from the region's top and left edge. */
function offsetIn(region: Element, cell: Element): { top: number; left: number } {
  const view = boxOf(region);
  const at = boxOf(cell);
  return { top: at.top - view.top, left: at.left - view.left };
}

/** The cells that stay (the corner, the header cells, the first column) and a plain cell of the fourth row that scrolls. */
function cellsOf(region: HTMLElement) {
  const row = region.querySelectorAll("tbody tr")[3];
  return {
    corner: must(region.querySelector("thead th:first-child"), "the corner cell"),
    heads: Array.from(region.querySelectorAll("thead th")),
    columns: Array.from(region.querySelectorAll("tbody th[scope='row']")),
    plain: must(row?.querySelector("td:nth-child(3)"), "a cell of the fourth row"),
  };
}

/** Whether `cell` is the topmost element at the middle of `part` of its box: no cell that scrolls shows through or over it. */
function onTop(cell: Element, part: Box): boolean {
  const hit = document.elementFromPoint((part.left + part.right) / 2, (part.top + part.bottom) / 2);
  return hit !== null && cell.contains(hit);
}

/** What the region does with the scroll, and what the cells that stay look like: sticky, with an opaque token surface. */
function expectSticky(region: HTMLElement, stay: Element[]): void {
  const style = getComputedStyle(region);
  check(
    style.overflowX === "auto" &&
      style.overflowY === "auto" &&
      style.overscrollBehaviorY === "contain",
    "the region scrolls both ways inside itself and keeps the scroll from the page",
  );
  for (const cell of stay) {
    const look = getComputedStyle(cell);
    check(
      look.position === "sticky",
      "a cell of the header row or the first column does not stick",
    );
    check(
      /^rgb\(/.test(look.backgroundColor),
      `a sticky cell is not opaque (${look.backgroundColor})`,
    );
  }
}

/** The frame and the page stay where they are while the region scrolls (DS-58, DS-61). */
function expectStill(frame: HTMLElement): void {
  check(frame.scrollTop === 0 && frame.scrollLeft === 0, "the frame scrolls");
  check(frame.scrollHeight <= frame.clientHeight + 1, "the frame is higher than its box");
  check(frame.scrollWidth <= frame.clientWidth + 1, "the frame is wider than its box");
  const page = must(document.scrollingElement, "the page");
  check(page.scrollTop === 0 && page.scrollLeft === 0, "the page scrolls");
  check(page.scrollWidth <= page.clientWidth + 1, "the page scrolls sideways");
}

/** Below this, a part of a box is too small to hit: the play looks for the next cell. */
const HIT_PX = 4;

/** The cell that shows beside or below the corner with a part at least `HIT_PX` large, and that part (the point to hit). */
function shownPart(region: Box, corner: Box, cells: Element[], axis: "head" | "column") {
  for (const cell of cells) {
    const box = boxOf(cell);
    const part =
      axis === "head"
        ? {
            ...box,
            left: Math.max(box.left, corner.right),
            right: Math.min(box.right, region.right),
          }
        : {
            ...box,
            top: Math.max(box.top, corner.bottom),
            bottom: Math.min(box.bottom, region.bottom),
          };
    if (part.right - part.left >= HIT_PX && part.bottom - part.top >= HIT_PX) return { cell, part };
  }
  return null;
}

/** No cell that scrolls shows over a cell that stays: the corner, a header cell right of it and a cell of the first column below it. */
function expectOnTop(region: HTMLElement, cells: ReturnType<typeof cellsOf>): void {
  const view = boxOf(region);
  const corner = boxOf(cells.corner);
  check(onTop(cells.corner, corner), "the corner cell is covered by a cell that scrolls");
  const head = must(
    shownPart(view, corner, cells.heads.slice(1), "head"),
    "a header cell beside the corner",
  );
  check(onTop(head.cell, head.part), "a header cell is covered by a cell that scrolls");
  const column = must(
    shownPart(view, corner, cells.columns, "column"),
    "a cell of the first column below the corner",
  );
  check(
    onTop(column.cell, column.part),
    "a cell of the first column is covered by a cell that scrolls",
  );
}

/** Waits until the fonts are in and two frames have passed: a box that a late font or a style change moves is not measured. */
export async function settle(): Promise<void> {
  await document.fonts.ready;
  const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
  await frame();
  await frame();
}

/** Scrolls the table region of the story down and sideways and judges what stays and what moves (see above). */
export async function keepsHeaderAndColumn(canvas: HTMLElement): Promise<void> {
  const region = must(
    canvas.querySelector<HTMLElement>('[data-scroll-region][data-scroll-x="table"]'),
    "the table region",
  );
  if (!hasLayout(region)) return;
  check(
    region.scrollHeight > region.clientHeight && region.scrollWidth > region.clientWidth,
    "the table is not larger than its region, so the story proves nothing",
  );
  await settle();
  const cells = cellsOf(region);
  expectSticky(region, [cells.corner, ...cells.heads, ...cells.columns]);
  const at = (list: Element[]) => list.map((cell) => offsetIn(region, cell));
  const before = { heads: at(cells.heads), columns: at(cells.columns), plain: at([cells.plain]) };
  region.scrollTop = SCROLL_PX;
  region.scrollLeft = SCROLL_PX;
  const reached = () =>
    Math.abs(region.scrollTop - Math.min(SCROLL_PX, region.scrollHeight - region.clientHeight)) <
      1 &&
    Math.abs(region.scrollLeft - Math.min(SCROLL_PX, region.scrollWidth - region.clientWidth)) < 1;
  await waitUntil(reached, "the region scrolls");
  await settle();
  // 0 px drift: the header row keeps its top and the first column its left; the corner keeps both.
  const drift = (list: Element[], key: "top" | "left", was: { top: number; left: number }[]) =>
    at(list).map((now, index) => Math.abs(now[key] - (was[index]?.[key] ?? Number.NaN)));
  const worst = Math.max(
    ...drift(cells.heads, "top", before.heads),
    ...drift(cells.columns, "left", before.columns),
    ...drift([cells.corner], "left", before.heads.slice(0, 1)),
  );
  check(worst < DRIFT_PX, `the header row or the first column drifted by ${worst} px`);
  // A plain cell moved by what the region scrolled, so the cells that stay held still against something.
  const [now] = at([cells.plain]);
  const [was] = before.plain;
  check(
    Math.abs((was?.top ?? 0) - (now?.top ?? 0) - region.scrollTop) < 1 &&
      Math.abs((was?.left ?? 0) - (now?.left ?? 0) - region.scrollLeft) < 1,
    "a plain cell does not scroll with the region",
  );
  expectOnTop(region, cells);
  expectStill(must(canvas.querySelector<HTMLElement>("[data-frame]"), "the frame"));
  region.scrollTop = 0;
  region.scrollLeft = 0;
}

/**
 * At 200 % text the root font size is at least 31 px (2 x 16): a story at 200 % waits for it before it measures, because the
 * decorator sets the size in a layout effect that can run after the play has started.
 */
export async function expectLargeText(canvas: HTMLElement): Promise<void> {
  const region = canvas.querySelector<HTMLElement>("[data-scroll-region]");
  if (!region || !hasLayout(region)) return;
  const size = () => parseFloat(getComputedStyle(document.documentElement).fontSize);
  await waitUntil(() => size() >= 31, "the text grows to 200 %");
}
