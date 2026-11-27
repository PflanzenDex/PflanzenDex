import { check, hasLayout, must, waitUntil } from "./story-play";
import { boxOf, settle } from "./table-play";

/**
 * The play of the stories of a control that has the focus under the cells that stay (US-QS-15, WCAG 2.4.11, issue 2573). It
 * scrolls the table region so that a control of a later column stands entirely under the first column and under the header
 * row, gives it the focus, and measures where it stands: the browser has to scroll it out from under both. It does so only
 * because the region keeps the room of the cells that stay as scroll padding: without it, the browser counts a control under
 * a sticky cell as shown, because it lies inside the scrollport, and leaves it where it is. A play measures only where
 * there is layout (the browser run of the conformance, 360 x 640 px); the jsdom run of the stories returns before the first
 * measure.
 */

/** The row of the body and the column (1 is the first) of the control the play uses: far enough in and down to scroll under the corner. */
const ROW = 6;
const COLUMN = 3;
/** Below this, a control stands clear: layout rounds a box to a fraction of a pixel. */
const CLEAR_PX = 1;

/** The cells that stay and the control: read again after each scroll, because their boxes move. */
function partsOf(region: HTMLElement) {
  const row = must(region.querySelectorAll("tbody tr")[ROW], "a row of the body");
  return {
    control: must(
      row.querySelector<HTMLElement>(`:scope > :nth-child(${COLUMN}) :is(button, a[href])`),
      "a control in a later column",
    ),
    column: must(row.firstElementChild, "the first cell of the row"),
    corner: must(region.querySelector("thead th:first-child"), "the corner cell"),
  };
}

/** The edges of what stays: the right edge of the first column and the bottom edge of the header row. */
function stayOf(parts: ReturnType<typeof partsOf>) {
  return { right: boxOf(parts.column).right, bottom: boxOf(parts.corner).bottom };
}

/**
 * Scrolls the region so that the control's right edge stands in the middle of the first column and its bottom edge in the
 * middle of the header row: the control lies entirely under the cells that stay (or beyond the edge of the region), which is
 * what the keeper sees as a focus that is gone.
 */
async function scrollUnder(region: HTMLElement, parts: ReturnType<typeof partsOf>): Promise<void> {
  region.scrollTop = 0;
  region.scrollLeft = 0;
  await settle();
  const at = boxOf(parts.control);
  const stay = stayOf(parts);
  const column = boxOf(parts.column);
  const corner = boxOf(parts.corner);
  region.scrollLeft = at.right - (stay.right - (column.right - column.left) / 2);
  region.scrollTop = at.bottom - (stay.bottom - (corner.bottom - corner.top) / 2);
  await settle();
}

/**
 * Puts a control of a later column entirely under the first column and the header row, gives it the focus and checks that it
 * stands out from under both afterwards: it shows in full beside the first column and below the header row, or, when it is
 * wider than the room beside the column (a phone at 200 % text), it fills that room. A `focus()` call scrolls as the Tab key does.
 */
export async function keepsFocusClear(canvas: HTMLElement): Promise<void> {
  const region = must(
    canvas.querySelector<HTMLElement>('[data-scroll-region][data-scroll-x="table"]'),
    "the table region",
  );
  if (!hasLayout(region)) return;
  await settle();
  const parts = partsOf(region);
  await scrollUnder(region, parts);
  const before = boxOf(parts.control);
  const stay = stayOf(parts);
  check(
    before.right <= stay.right + CLEAR_PX && before.bottom <= stay.bottom + CLEAR_PX,
    "the control does not stand under the first column and the header row before the focus, so the story proves nothing",
  );
  parts.control.focus();
  await waitUntil(() => document.activeElement === parts.control, "the control gets the focus");
  await settle();
  const shown = boxOf(parts.control);
  const now = stayOf(parts);
  const view = boxOf(region);
  // The part of the control that shows beside the first column, inside the region: all of it when it fits the room there,
  // otherwise the whole room (the browser puts a control that is wider than the room in the middle of it).
  const room = view.left + region.clientLeft + region.clientWidth - now.right;
  const showing = Math.min(shown.right, now.right + room) - Math.max(shown.left, now.right);
  check(
    showing >= Math.min(shown.right - shown.left, room) - CLEAR_PX,
    `the focused control stands under the first column (${shown.left} to ${shown.right} px, the column ends at ${now.right} px)`,
  );
  check(
    shown.top >= now.bottom - CLEAR_PX,
    `the focused control stands under the header row (${shown.top} px, the row ends at ${now.bottom} px)`,
  );
  parts.control.blur();
  region.scrollTop = 0;
  region.scrollLeft = 0;
}
