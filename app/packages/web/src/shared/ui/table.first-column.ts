import * as React from "react";

/** The variable that holds the measured width of the first column; the class `scroll-pl-(--table-first-col)` reads it. */
const FIRST_COLUMN_WIDTH = "--table-first-col";

/**
 * The share of the region that the first column may take while it sticks. A wider one leaves too little room beside it for a
 * focused control (at 200 % text on a phone it is more than two thirds of the region), so it stops sticking (WCAG 2.4.11,
 * issue 2601).
 */
const STICKY_SHARE = 0.5;

/**
 * Judges the first column of a table (its first cell, `th` or `td`) and writes the result on the scroll region (US-QS-15,
 * issues 2573 and 2601). The width is not known in advance: it follows the content and the text size.
 *
 * - The first column sticks (`data-first-col="sticky"`) while it takes at most half of the region: its width is the
 *   variable `--table-first-col`, which the region keeps as scroll padding on the left, so that a focused control stays
 *   clear of it.
 * - Wider than that it is loose (`data-first-col="loose"`): the cells of the first column scroll like the others (the class
 *   `group-data-[first-col=loose]/table:first:left-auto` of the cells reads the attribute), and the variable is removed, so
 *   that the scroll padding is 0.
 *
 * The judgement reads the width of the cell as it is laid out, and that does not change when a cell stops sticking (only its
 * place does), so the two states do not flip each other. It is made before the first paint and again when the region, the
 * table or the first cell changes its size; a first cell that is replaced is watched from then on. A table without a width
 * (hidden, `display: none`), without a row, or in a browser without a `ResizeObserver` (judged once) leaves neither the
 * variable nor the attribute: the padding then is 0, and the cells stick, as they did before.
 */
export function useFirstColumn(region: React.RefObject<HTMLElement | null>): void {
  React.useLayoutEffect(() => {
    const box = region.current;
    if (!box) return;
    let watched: Element | null = null;
    const observer =
      typeof ResizeObserver === "function" ? new ResizeObserver(() => judge()) : null;
    const judge = () => {
      const cell = box.querySelector("table")?.rows[0]?.cells[0] ?? null;
      if (cell !== watched) {
        if (watched) observer?.unobserve(watched);
        if (cell) observer?.observe(cell);
        watched = cell;
      }
      const width = cell?.getBoundingClientRect().width ?? 0;
      if (width <= 0) {
        box.style.removeProperty(FIRST_COLUMN_WIDTH);
        delete box.dataset["firstCol"];
        return;
      }
      const loose = width > box.clientWidth * STICKY_SHARE && box.clientWidth > 0;
      if (loose) box.style.removeProperty(FIRST_COLUMN_WIDTH);
      else box.style.setProperty(FIRST_COLUMN_WIDTH, `${width}px`);
      box.dataset["firstCol"] = loose ? "loose" : "sticky";
    };
    const table = box.querySelector("table");
    observer?.observe(box);
    if (table) observer?.observe(table);
    judge();
    return () => observer?.disconnect();
  }, [region]);
}
