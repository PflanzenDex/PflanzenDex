import { useLayoutEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";

/** From this width (Tailwind `md`, 768 px) a row of chips may take two lines (US-QS-19, issue 1281, owner decision 2026-11-05). */
const WIDE_QUERY = "(min-width: 768px)";

/** The gap between two chips of the measuring row (`gap-2`, 8 px), when the layout reports none. */
const CHIP_GAP_PX = 8;

function subscribeWide(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function")
    return () => undefined;
  const query = window.matchMedia(WIDE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** True from 768 px up; without `matchMedia` (jsdom) the row counts as narrow. Follows a change of the width live. */
export function useWideRow(): boolean {
  return useSyncExternalStore(
    subscribeWide,
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia(WIDE_QUERY).matches,
    () => false,
  );
}

/**
 * The lines the chips take when laid out greedily in a row of `available` px with `gap` px between two chips, the way a
 * flex row wraps; `null` when one chip is wider than the row. Two chips that fit twice the width may still need three
 * lines, so the sum of the widths is not the answer.
 */
export function linesNeeded(
  widths: readonly number[],
  gap: number,
  available: number,
): number | null {
  let lines = 1;
  let used = 0;
  for (const width of widths) {
    if (width > available) return null;
    if (used === 0) used = width;
    else if (used + gap + width <= available) used += gap + width;
    else {
      lines += 1;
      used = width;
    }
  }
  return lines;
}

/**
 * Whether the chips of the measuring row take at most `maxLines` lines in the row. Each chip is measured in its widest
 * form, so the answer never depends on the chosen chip. Without a measurable layout the chips stay (the default).
 */
function fitsInLines(row: HTMLElement, measure: HTMLElement, maxLines: number): boolean {
  const available = row.getBoundingClientRect().width;
  const widths = Array.from(measure.children, (chip) => chip.getBoundingClientRect().width);
  if (!(available > 0) || widths.length === 0 || widths.some((w) => !(w > 0))) return true;
  const gap = Number.parseFloat(getComputedStyle(measure).columnGap);
  const lines = linesNeeded(widths, Number.isFinite(gap) ? gap : CHIP_GAP_PX, available);
  return lines !== null && lines <= maxLines;
}

/**
 * Whether the chips of a group row fit the row (US-QS-19, issue 1281): one line below 768 px, up to two lines from
 * 768 px, measured in the layout before the browser paints. A hidden measuring row draws every chip in its widest form.
 * The decision runs after every render (a new count changes the widths; the result is compared, so a repeated one
 * renders nothing and cannot loop) and whenever the row or the measuring row changes its size (a resize, a rotation, a
 * text size, late fonts) or the breakpoint changes. `active` is false while the row has no choices: it is measured
 * again as soon as there are some.
 */
export function useChipsFit(active: boolean): {
  row: RefObject<HTMLDivElement | null>;
  measure: RefObject<HTMLDivElement | null>;
  fits: boolean;
} {
  const row = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLDivElement>(null);
  const wide = useWideRow();
  const [fits, setFits] = useState(true);
  const check = useRef<() => void>(() => undefined);
  useLayoutEffect(() => {
    check.current = () => {
      const r = row.current;
      const m = measure.current;
      if (!r || !m) return;
      const next = fitsInLines(r, m, wide ? 2 : 1);
      setFits((prev) => (prev === next ? prev : next));
    };
    check.current();
  });
  useLayoutEffect(() => {
    if (!active || typeof ResizeObserver === "undefined") return;
    // jsdom has no ResizeObserver: the check after every render is then the only one, and no layout exists there anyway.
    const observer = new ResizeObserver(() => check.current());
    if (row.current) observer.observe(row.current);
    if (measure.current) observer.observe(measure.current);
    return () => observer.disconnect();
  }, [active, wide]);
  return { row, measure, fits };
}
