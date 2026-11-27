import { check, hasLayout, must, waitUntil } from "./story-play";
import {
  boxOf,
  cellsOf,
  expectOnTop,
  expectSticky,
  expectStill,
  measuresFirstColumn,
  settle,
  type Cells,
  type FirstColumn,
} from "./table-measure";

/**
 * The play of the stories of the table that keeps its header row and its first column (US-QS-15, SG-LIST-01, DS-58, DS-61;
 * matrix row 22 of the scroll gates spike, issue 2420). It scrolls the table region down and sideways and measures the boxes:
 * the header row and the first column drift 0 px against the region, a plain cell scrolls with it, no cell that scrolls
 * shows over a cell that stays, and neither the frame nor the page scrolls. A first column that takes more than half of the
 * region is loose (issue 2601, WCAG 2.4.11): it scrolls like a plain cell, and only the header row and the corner stay at
 * the top. A play measures only where there is layout (the browser run of the conformance, 360 x 640 px); the jsdom run of
 * the stories returns before the first measure.
 */
/** Below this, a box has not drifted: layout rounds a box to a fraction of a pixel. */
const DRIFT_PX = 0.5;
/** How far the play scrolls the region, down and sideways. */
const SCROLL_PX = 140;

type Offset = { top: number; left: number };

/** Where a cell stands in its region: the distance of its box from the region's top and left edge. */
function offsetIn(region: Element, cell: Element): Offset {
  const view = boxOf(region);
  const at = boxOf(cell);
  return { top: at.top - view.top, left: at.left - view.left };
}

/** How far a cell has moved from `was` to `now` along `key`, against what the region scrolled: 0 for a cell that scrolls with the region. */
const held = (was: number, now: number, scrolled: number) => Math.abs(was - now - scrolled);

/**
 * 0 px drift: the header row keeps its top. A sticky first column keeps its left, and so does the corner; a loose one scrolls
 * sideways with the region, as a plain cell does.
 */
function expectDrift(
  region: HTMLElement,
  cells: Cells,
  first: FirstColumn,
  before: { heads: Offset[]; columns: Offset[] },
): void {
  const at = (list: Element[]) => list.map((cell) => offsetIn(region, cell));
  const drift = (list: Element[], key: "top" | "left", was: Offset[]) =>
    at(list).map((now, index) => Math.abs(now[key] - (was[index]?.[key] ?? Number.NaN)));
  const sticky = first === "sticky";
  const worst = Math.max(
    ...drift(cells.heads, "top", before.heads),
    ...(sticky ? drift(cells.columns, "left", before.columns) : []),
    ...(sticky ? drift([cells.corner], "left", before.heads.slice(0, 1)) : []),
  );
  check(worst < DRIFT_PX, `the header row or the first column drifted by ${worst} px`);
  const moved = at(cells.columns).map((now, index) =>
    held(before.columns[index]?.left ?? Number.NaN, now.left, region.scrollLeft),
  );
  check(
    sticky || Math.max(...moved) < 1,
    `a loose first column does not scroll sideways with the region (${Math.max(...moved)} px off)`,
  );
}

/**
 * Scrolls the table region of the story down and sideways and judges what stays and what moves (see above). `first` is the
 * state the story expects of the first column: the play fails when `Table` measures another one, so a story proves what it
 * says.
 */
export async function keepsHeaderAndColumn(
  canvas: HTMLElement,
  first: FirstColumn = "sticky",
): Promise<void> {
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
  await measuresFirstColumn(region, first);
  const cells = cellsOf(region);
  expectSticky(region, cells, first);
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
  expectDrift(region, cells, first, before);
  // A plain cell moved by what the region scrolled, so the cells that stay held still against something.
  const [now] = at([cells.plain]);
  const [was] = before.plain;
  check(
    held(was?.top ?? 0, now?.top ?? 0, region.scrollTop) < 1 &&
      held(was?.left ?? 0, now?.left ?? 0, region.scrollLeft) < 1,
    "a plain cell does not scroll with the region",
  );
  expectOnTop(region, cells, first);
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
