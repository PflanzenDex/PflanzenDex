import { check, must, waitUntil } from "./story-play";

/**
 * What the plays of the Table stories (`table-play.ts`, `table-focus-play.ts`) measure and judge with: the boxes of the cells,
 * the cells that stay, and the checks of what stays and what moves (US-QS-15, SG-LIST-01, WCAG 2.4.11, issues 2420, 2573
 * and 2601). They measure only where there is layout; the plays return before the first measure without it (jsdom).
 */
export type Box = { top: number; left: number; right: number; bottom: number };

/** What `Table` measures of its first column (`data-first-col` of the region): it sticks, or it is loose and scrolls with the cells. */
export type FirstColumn = "sticky" | "loose";

export const boxOf = (element: Element): Box => {
  const { top, left, right, bottom } = element.getBoundingClientRect();
  return { top, left, right, bottom };
};

/** Waits until the fonts are in and two frames have passed: a box that a late font or a style change moves is not measured. */
export async function settle(): Promise<void> {
  await document.fonts.ready;
  const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
  await frame();
  await frame();
}

/** Waits until `Table` has measured the first column the story expects: the story proves nothing when it measures another one. */
export async function measuresFirstColumn(region: HTMLElement, first: FirstColumn): Promise<void> {
  const measured = () => region.dataset["firstCol"];
  await waitUntil(() => measured() === first, `the table measures a ${first} first column`).catch(
    (error: Error) => {
      throw new Error(`${error.message} (it measures ${measured() ?? "none"})`);
    },
  );
}

/** The cells that stay (the corner, the header cells, the first column) and a plain cell of the fourth row that scrolls. */
export function cellsOf(region: HTMLElement) {
  const row = region.querySelectorAll("tbody tr")[3];
  return {
    corner: must(region.querySelector("thead th:first-child"), "the corner cell"),
    heads: Array.from(region.querySelectorAll("thead th")),
    columns: Array.from(region.querySelectorAll("tbody th[scope='row']")),
    plain: must(row?.querySelector("td:nth-child(3)"), "a cell of the fourth row"),
  };
}

export type Cells = ReturnType<typeof cellsOf>;

/** Whether `cell` is the topmost element at the middle of `part` of its box: no cell that scrolls shows through or over it. */
function onTop(cell: Element, part: Box): boolean {
  const hit = document.elementFromPoint((part.left + part.right) / 2, (part.top + part.bottom) / 2);
  return hit !== null && cell.contains(hit);
}

/**
 * What the region does with the scroll, and what the cells that stay look like: sticky, with an opaque token surface. A loose
 * first column (and the corner) keeps its surface but no `left`: it does not stick to the left of the region.
 */
export function expectSticky(region: HTMLElement, cells: Cells, first: FirstColumn): void {
  const style = getComputedStyle(region);
  check(
    style.overflowX === "auto" &&
      style.overflowY === "auto" &&
      style.overscrollBehaviorY === "contain",
    "the region scrolls both ways inside itself and keeps the scroll from the page",
  );
  const columns = [cells.corner, ...cells.columns];
  for (const cell of [...cells.heads, ...cells.columns]) {
    const look = getComputedStyle(cell);
    const mustStick = first === "sticky" || cells.heads.includes(cell);
    check(
      !mustStick || look.position === "sticky",
      "a cell of the header row or the first column does not stick",
    );
    check(
      /^rgb\(/.test(look.backgroundColor),
      `a sticky cell is not opaque (${look.backgroundColor})`,
    );
  }
  for (const cell of columns)
    check(
      first === "sticky"
        ? getComputedStyle(cell).left === "0px"
        : getComputedStyle(cell).left === "auto",
      `a ${first} first column cell has the wrong left (${getComputedStyle(cell).left})`,
    );
}

/** The frame and the page stay where they are while the region scrolls (DS-58, DS-61). */
export function expectStill(frame: HTMLElement): void {
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

/**
 * No cell that scrolls shows over a cell that stays: the corner, a header cell right of it and a cell of the first column
 * below it. A loose first column scrolls under nothing: only the header cells that show are tested, from the left edge of the
 * region.
 */
export function expectOnTop(region: HTMLElement, cells: Cells, first: FirstColumn): void {
  const view = boxOf(region);
  const corner = boxOf(cells.corner);
  const sticky = first === "sticky";
  if (sticky)
    check(onTop(cells.corner, corner), "the corner cell is covered by a cell that scrolls");
  const head = must(
    shownPart(
      view,
      sticky ? corner : { ...corner, right: view.left },
      sticky ? cells.heads.slice(1) : cells.heads,
      "head",
    ),
    "a header cell beside the corner",
  );
  check(onTop(head.cell, head.part), "a header cell is covered by a cell that scrolls");
  if (!sticky) return;
  const column = must(
    shownPart(view, corner, cells.columns, "column"),
    "a cell of the first column below the corner",
  );
  check(
    onTop(column.cell, column.part),
    "a cell of the first column is covered by a cell that scrolls",
  );
}
