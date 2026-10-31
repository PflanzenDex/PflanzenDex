import { useLayoutEffect, useState, type RefObject } from "react";

/** The measures of a list region in px: its free height, one row and the gap between two rows. */
export type FitInput = {
  height: number;
  rowHeight: number;
  gap: number;
  /** Entries side by side in a row: the tracks of a grid, 1 for a column. */
  columns: number;
  /** Fewest rows on a page, so a page never shows less than a row (starting value, assumption: 1). */
  minRows?: number;
};

/**
 * Entries per page that fit a list region (US-QS-19, issue 1029): whole rows, because n rows need n × row + (n − 1) × gap
 * px, times the columns of a grid. `null` without a layout (no height or no row), so the caller keeps its starting value.
 */
export function fitPageSize({
  height,
  rowHeight,
  gap,
  columns,
  minRows = 1,
}: FitInput): number | null {
  if (!(height > 0) || !(rowHeight > 0)) return null;
  const rows = Math.max(minRows, Math.floor((height + gap) / (rowHeight + gap)));
  return rows * Math.max(1, columns);
}

/**
 * The page the address names after a page size change from the layout (US-QS-19, issue 1029): the page that holds the
 * first entry of the page before stays on screen when it can. Without a change it is `page`, the nearest valid page.
 */
export function pageAfterResize({
  before,
  measured,
  raw,
  count,
  page,
}: {
  before: number | null;
  measured: number | null;
  raw: number;
  count: number;
  page: number;
}): number {
  if (before === null || measured === null || before === measured) return page;
  const pages = Math.max(1, Math.ceil(count / before));
  return Math.floor(((Math.min(raw, pages) - 1) * before) / measured) + 1;
}

/**
 * What the layout says about a list region: the page size that fits it (`null` while the region has no height) and the
 * height of one row (kept even when the region is squeezed to nothing, so the frame can make room for it).
 */
export type PageFit = { size: number | null; rowHeight: number };

/** Reads the measures of a rendered list region and its first row from the layout; `null` without a rendered row. */
function measure(list: HTMLElement): PageFit | null {
  const rowHeight = list.firstElementChild?.getBoundingClientRect().height ?? 0;
  if (!(rowHeight > 0)) return null;
  const style = getComputedStyle(list);
  const tracks = style.gridTemplateColumns;
  const size = fitPageSize({
    height: list.getBoundingClientRect().height,
    rowHeight,
    gap: Number.parseFloat(style.rowGap) || 0,
    columns: tracks && tracks !== "none" ? tracks.trim().split(/\s+/).length : 1,
  });
  return { size, rowHeight };
}

/**
 * The page size that fills the free height of a list region (US-QS-19, issue 1029). The region is measured after every
 * render, because the rows change with the page, and again whenever the region or a row changes its size. `null` while
 * there is no layout. The region must be sized by its frame (`flex-1 min-h-0`), not by its content: otherwise it holds
 * every entry. The caller keeps one row as the smallest height of the region, so a large text makes the frame scroll
 * instead of squeezing the list under the pager.
 */
export function usePageFit(list: RefObject<HTMLElement | null>, enabled: boolean): PageFit | null {
  const [fit, setFit] = useState<PageFit | null>(null);
  useLayoutEffect(() => {
    if (!enabled) return;
    const update = () => {
      const el = list.current;
      if (!el) return;
      const next = measure(el);
      // Compare the values: a new object each time would re-render, and so measure again, forever.
      setFit((prev) =>
        prev?.size === next?.size && prev?.rowHeight === next?.rowHeight ? prev : next,
      );
    };
    update();
    // jsdom has no ResizeObserver: the measure after every render is then the only one, and no layout exists there anyway.
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    const el = list.current;
    if (el) {
      observer.observe(el);
      for (const row of Array.from(el.children)) observer.observe(row);
    }
    return () => observer.disconnect();
  });
  return enabled ? fit : null;
}
