import type * as React from "react";

/**
 * Brings a control of the table that gets the focus from the keyboard entirely into the room that is free (WCAG 2.4.11, US-QS-15,
 * issue 2601): sideways between the first column (while it sticks) and the right edge of the region, with the room of the focus
 * ring on both sides. The browser alone does not do it. When it moves the focus into view it leaves a box where it is as soon
 * as 32 px of it show (Chromium, "partly visible but over a threshold"), so a control that is partly under the first column or
 * partly outside the right edge keeps its place, cut off and without the end of its ring. Vertically the browser is right: the
 * scroll padding of the region (`scroll-pt-11`, the height of the header row) is all it needs.
 *
 * The room is what the scroll padding of the region says (`scroll-pl-(--table-first-col)`, `scroll-pr-2`), so that the
 * classes stay the one place that knows it: the padding on the left is the width of the first column, and 0 while the column
 * is loose. A control wider than the room is aligned to its left side, so that its start shows. A control in the sticky first
 * column (or the corner) is always in view and stays out of it. A control that gets the focus from the pointer (not
 * `:focus-visible`) is left where it is: the table moving under a pressed finger would make it miss the click.
 */
export function keepFocusClear(event: React.FocusEvent<HTMLElement>): void {
  const region = event.currentTarget;
  const control = event.target as HTMLElement;
  if (control === region || !control.matches(":focus-visible")) return;
  const cell = control.closest("th, td");
  if (
    cell instanceof HTMLTableCellElement &&
    cell.cellIndex === 0 &&
    region.dataset["firstCol"] !== "loose"
  )
    return;
  const style = getComputedStyle(region);
  // The same room on both sides for the ring, and the width of the sticky column on the left (0 when there is none).
  const ring = parseFloat(style.scrollPaddingRight) || 0;
  const inner = region.getBoundingClientRect().left + region.clientLeft;
  const start = inner + (parseFloat(style.scrollPaddingLeft) || 0) + ring;
  const end = inner + region.clientWidth - ring;
  const box = control.getBoundingClientRect();
  if (box.left < start) region.scrollLeft -= start - box.left;
  else if (box.right > end) region.scrollLeft += Math.min(box.right - end, box.left - start);
}
