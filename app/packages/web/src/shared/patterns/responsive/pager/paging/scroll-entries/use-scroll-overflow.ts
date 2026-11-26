import * as React from "react";
import { END_ROW } from "./list-end/list-end";

/**
 * How long the box must stay as it is before the measure counts (starting value, assumption): a font or an image that
 * arrives late changes the heights, and the end marker must not come and go with it (SG-STATE-02).
 */
export const SETTLE_MS = 120;

/** The box that scrolls the list: the list itself when it fills its frame (`fit`), else the region or the main area around it. */
function scrollerOf(list: HTMLElement, fit: boolean): HTMLElement {
  return fit ? list : (list.closest<HTMLElement>("[data-scroll-region], main") ?? list);
}

/** The last row that is an entry; the loader, retry and end rows after it are not part of what the keeper scrolls through. */
function lastEntry(list: HTMLElement): Element | undefined {
  const rows = Array.from(list.children).filter((row) => !row.hasAttribute(END_ROW));
  return rows.at(-1);
}

/** Whether the entries reach beyond the bottom of the box that scrolls them. Without layout (jsdom) nothing does. */
function overflows(list: HTMLElement, fit: boolean): boolean {
  const last = lastEntry(list);
  if (!last) return false;
  const box = scrollerOf(list, fit);
  const end = last.getBoundingClientRect().bottom - box.getBoundingClientRect().top + box.scrollTop;
  return end > box.clientHeight + 1;
}

/**
 * Whether the entries of the list are taller than the box that scrolls them (SG-LIST-01: the end marker stays away on a
 * short list that fits). It measures after a settle and again when the box changes size or the loaded entries change. A
 * browser without a ResizeObserver and a test without layout measure nothing: the answer is "no", so no marker shows. A
 * list without server paging (`paged` false) is measured only when its box is a marked scroll region: the end marker adds a
 * row, and a page that scrolls (the frame gate lists it) must not grow by it.
 */
export function useScrollOverflow(
  list: React.RefObject<HTMLElement | null>,
  fit: boolean,
  loaded: number,
  paged: boolean,
): boolean {
  const [over, setOver] = React.useState(false);
  React.useEffect(() => {
    const box = list.current;
    if (!box || typeof ResizeObserver !== "function") return;
    if (!paged && !scrollerOf(box, fit).hasAttribute("data-scroll-region")) return;
    let timer = 0;
    const measure = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setOver(overflows(box, fit)), SETTLE_MS);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(scrollerOf(box, fit));
    measure();
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [list, fit, loaded, paged]);
  return over;
}
