import { useLayoutEffect, type RefObject } from "react";

/** A sticky heading may cover at most one third of its scroll region (starting value, assumption; SG-LIST-06). */
const MAX_SHARE = 3;

/**
 * Keeps the headings of a long grouped list sticky only while they leave the region room (SG-LIST-06, WCAG 1.4.4, 2.4.11):
 * a name that wraps to three lines at 200 % text would cover half of a small region. `box` holds the sections; the region
 * is its marked scroll region. The answer is the attribute `data-sticky="on" | "off"` on `box`, which the headings read
 * (`group-data-[sticky=off]/sections:static`). It is measured again when the region or a heading changes its size. Without
 * layout (a test, a browser without `ResizeObserver`) the headings stay sticky.
 */
export function useStickyFit(box: RefObject<HTMLElement | null>, groups: number): void {
  useLayoutEffect(() => {
    const root = box.current;
    if (!root) return;
    const region = root.closest<HTMLElement>("[data-scroll-region]") ?? root;
    const headings = Array.from(root.querySelectorAll<HTMLElement>("[data-group-heading]"));
    const check = () => {
      const tallest = Math.max(0, ...headings.map((h) => h.offsetHeight));
      const room = region.clientHeight;
      root.setAttribute("data-sticky", room > 0 && tallest * MAX_SHARE > room ? "off" : "on");
    };
    check();
    if (typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(check);
    observer.observe(region);
    for (const heading of headings) observer.observe(heading);
    return () => observer.disconnect();
  }, [box, groups]);
}
