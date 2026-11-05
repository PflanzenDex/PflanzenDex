import { useLayoutEffect, useRef, useState, type RefObject } from "react";

/**
 * Whether the chips of a group row fit on one line of the row (US-QS-19, issue 1281). The row and a hidden measuring box
 * are measured in the layout before the browser paints, and again whenever either changes its size (a resize, a
 * rotation, a text size, late fonts). The measuring box always draws every chip in its widest form, so the decision
 * never depends on the chosen chip and the measured width never depends on the decision: no loop. Without a layout
 * (jsdom, no measurable width) the chips stay, the default.
 */
export function useChipsFit(): {
  row: RefObject<HTMLDivElement | null>;
  measure: RefObject<HTMLDivElement | null>;
  fits: boolean;
} {
  const row = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLDivElement>(null);
  const [fits, setFits] = useState(true);
  useLayoutEffect(() => {
    const update = () => {
      const r = row.current;
      const m = measure.current;
      if (!r || !m) return;
      const available = r.getBoundingClientRect().width;
      const needed = m.getBoundingClientRect().width;
      const next = available > 0 && needed > 0 ? needed <= available : true;
      // Compare the values: a state change that repeats the old one would render again, and measure again, forever.
      setFits((prev) => (prev === next ? prev : next));
    };
    update();
    // jsdom has no ResizeObserver: the measure on mount is then the only one, and no layout exists there anyway.
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    if (row.current) observer.observe(row.current);
    if (measure.current) observer.observe(measure.current);
    return () => observer.disconnect();
  }, []);
  return { row, measure, fits };
}
