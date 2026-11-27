import { check, hasLayout, must, waitUntil } from "./story-play";
import { boxOf, measuresFirstColumn, settle, type FirstColumn } from "./table-measure";

/**
 * The play of the stories of a control that has the focus beside the cells that stay (US-QS-15, WCAG 2.4.11, issues 2573 and
 * 2601). It scrolls the table region so that a control of a later column is under the first column, partly under it or partly
 * outside the right edge, gives it the focus, and measures where it stands: it must stand entirely in the room that is
 * free, with the room of its focus ring on both sides. The room is beside the first column while that column sticks, and
 * the whole region when the column is loose (it takes more than half of the region, `Table`). A play measures only where
 * there is layout (the browser run of the conformance, 360 x 640 px); the jsdom run of the stories returns before the first
 * measure.
 */

/** The row of the body and the column (1 is the first) of the control the play uses: far enough in and down to scroll under the corner. */
const ROW = 6;
const COLUMN = 3;
/** Below this, a control stands clear: layout rounds a box to a fraction of a pixel. */
const CLEAR_PX = 1;
/** The room of the focus ring beside a control: the ring is 2 px wide and 2 px off (`ring-2`, `ring-offset-2`). */
const RING_PX = 4;
/**
 * How much of the control still shows when a start leaves it partly out of the room. Chromium treats a box of which 32 px
 * show as shown and does not scroll it sideways, so the play starts from a part that is larger than that.
 */
const PEEK_PX = 40;
/** How far beyond the left edge of the room the control starts when it is out of sight. */
const OUT_PX = 8;

/** Where the control stands before it gets the focus. */
type Start = "hidden" | "partly-left" | "partly-right";
const STARTS: Start[] = ["hidden", "partly-left", "partly-right"];

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

type Room = { left: number; right: number; top: number; bottom: number };

/**
 * The room a focused control must stand in: beside the first column while it sticks, in the region when it is loose; below the
 * header row; up to the inner edges of the region (without its border and scrollbar).
 */
function roomOf(region: HTMLElement, parts: ReturnType<typeof partsOf>, first: FirstColumn): Room {
  const view = boxOf(region);
  const inner = {
    left: view.left + region.clientLeft,
    top: view.top + region.clientTop,
  };
  return {
    left: first === "sticky" ? boxOf(parts.column).right : inner.left,
    right: inner.left + region.clientWidth,
    top: boxOf(parts.corner).bottom,
    bottom: inner.top + region.clientHeight,
  };
}

/** Whether the control stands entirely in the room, with the room of its focus ring on both sides. */
function stands(box: ReturnType<typeof boxOf>, room: Room): boolean {
  return (
    box.left >= room.left + RING_PX - CLEAR_PX &&
    box.right <= room.right - RING_PX + CLEAR_PX &&
    box.top >= room.top - CLEAR_PX &&
    box.bottom <= room.bottom + CLEAR_PX
  );
}

const describeBox = (box: Room) =>
  `${Math.round(box.left)} to ${Math.round(box.right)} px across, ${Math.round(box.top)} to ${Math.round(box.bottom)} px down`;

/** Scrolls the region so that the control stands where `start` says (see `Start`); a start that the table cannot reach is clamped by the region. */
async function scrollTo(
  region: HTMLElement,
  parts: ReturnType<typeof partsOf>,
  first: FirstColumn,
  start: Start,
): Promise<void> {
  region.scrollTop = 0;
  region.scrollLeft = 0;
  await settle();
  const at = boxOf(parts.control);
  const room = roomOf(region, parts, first);
  const header = room.top - boxOf(parts.corner).top;
  if (start === "hidden") {
    // Entirely under the first column (its middle) and the header row (its middle), or beyond the left edge when it is loose.
    const column = boxOf(parts.column);
    const edge =
      first === "sticky" ? room.left - (column.right - column.left) / 2 : room.left - OUT_PX;
    region.scrollLeft = at.right - edge;
    region.scrollTop = at.bottom - (room.top - header / 2);
  } else {
    region.scrollLeft = Math.max(
      0,
      start === "partly-left" ? at.right - (room.left + PEEK_PX) : at.left - (room.right - PEEK_PX),
    );
    // Vertically in the middle of the room, so that only the sideways position is at fault.
    region.scrollTop = Math.max(
      0,
      at.top - (room.top + (room.bottom - room.top - (at.bottom - at.top)) / 2),
    );
  }
  await settle();
}

/** Whether the control stands where `start` says before the focus: the story proves nothing when it does not. */
function placed(start: Start, box: ReturnType<typeof boxOf>, room: Room): boolean {
  if (start === "hidden")
    return box.right <= room.left + CLEAR_PX && box.bottom <= room.top + CLEAR_PX;
  if (start === "partly-left") return box.left < room.left && box.right > room.left;
  return box.right > room.right - RING_PX && box.left < room.right;
}

/** The play for one start: the control stands as the start says before the focus, and entirely in the room afterwards. */
async function focusFrom(
  region: HTMLElement,
  parts: ReturnType<typeof partsOf>,
  first: FirstColumn,
  start: Start,
): Promise<void> {
  await scrollTo(region, parts, first, start);
  const before = boxOf(parts.control);
  check(
    placed(start, before, roomOf(region, parts, first)),
    `${start}: the control does not start where the story says (${describeBox(before)}), so the story proves nothing`,
  );
  parts.control.focus();
  await waitUntil(() => document.activeElement === parts.control, "the control gets the focus");
  await settle();
  const shown = boxOf(parts.control);
  const room = roomOf(region, parts, first);
  check(
    stands(shown, room),
    `${start}: the focused control (${describeBox(shown)}) is not entirely in the room (${describeBox(room)}, ${first} first column, ${RING_PX} px kept at each side for the ring)`,
  );
  parts.control.blur();
}

/**
 * Starts the focus of a control of a later column from each position of `STARTS` and checks that the control stands entirely
 * in the free room afterwards: not under or partly under the first column or the header row, not out of the region on the
 * right, and with the room of its focus ring. `first` is the state the story expects of the first column (the story proves
 * nothing when `Table` measures another one). A `focus()` call scrolls as the Tab key does.
 */
export async function keepsFocusClear(canvas: HTMLElement, first: FirstColumn): Promise<void> {
  const region = must(
    canvas.querySelector<HTMLElement>('[data-scroll-region][data-scroll-x="table"]'),
    "the table region",
  );
  if (!hasLayout(region)) return;
  await settle();
  await measuresFirstColumn(region, first);
  const parts = partsOf(region);
  for (const start of STARTS) await focusFrom(region, parts, first, start);
  region.scrollTop = 0;
  region.scrollLeft = 0;
}
