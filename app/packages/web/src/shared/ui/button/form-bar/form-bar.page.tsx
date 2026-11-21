import * as React from "react";

/** The custom property that tells the page how tall the sticky bar is, so a focused field scrolls clear of it (`tokens.css`). */
export const BAR_HEIGHT_PROPERTY = "--form-bar-height";

/** The nearest ancestor that scrolls (a sticky bar sticks to it); `null` when the page itself scrolls. */
function scrollerOf(el: HTMLElement): HTMLElement | null {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowY;
    if (overflow === "auto" || overflow === "scroll" || overflow === "hidden") return node;
  }
  return null;
}

/** The height of the app's top bar while it is pinned to the window (the tall window); 0 when it scrolls away or is hidden. */
function pinnedHeaderHeight(): number {
  const header = document.querySelector("header");
  if (!header || getComputedStyle(header).position !== "sticky") return 0;
  return header.getBoundingClientRect().height;
}

/**
 * Where the sticky bar of a page form sticks (US-QS-32, SG-FORM-02): at the top of its scroller, below the app's pinned top
 * bar, and never above the visual viewport. With a phone keyboard open the visual viewport is the strip above the
 * keyboard and the browser pans it over the page; a bar stuck to the layout viewport would then lie outside it. The bar
 * follows `offsetTop` of `window.visualViewport` on its `resize` and `scroll`. It also publishes its height as
 * `--form-bar-height`, which keeps a focused field from scrolling under it.
 */
export function usePageBar(ref: React.RefObject<HTMLElement | null>): void {
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const viewport = window.visualViewport;
    const place = () => {
      const scroller = scrollerOf(el);
      const below = scroller ? 0 : pinnedHeaderHeight();
      const panned = (viewport?.offsetTop ?? 0) - (scroller?.getBoundingClientRect().top ?? 0);
      el.style.top = `${Math.max(below, panned)}px`;
      root.style.setProperty(BAR_HEIGHT_PROPERTY, `${el.offsetHeight}px`);
    };
    place();
    viewport?.addEventListener("resize", place);
    viewport?.addEventListener("scroll", place);
    window.addEventListener("resize", place);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(place);
    observer?.observe(el);
    return () => {
      viewport?.removeEventListener("resize", place);
      viewport?.removeEventListener("scroll", place);
      window.removeEventListener("resize", place);
      observer?.disconnect();
      root.style.removeProperty(BAR_HEIGHT_PROPERTY);
    };
  }, [ref]);
}

/** What a `FormBarRegion` gives its `FormBar`: the place at the top of the form where the bar goes below `md`; `slot` is `null` until it is mounted. */
const RegionContext = React.createContext<{ slot: HTMLElement | null } | null>(null);

/** The region a `FormBar` is in; `null` when it is in none (a form that is no page form, or a layer). */
export function useFormBarRegion(): { slot: HTMLElement | null } | null {
  return React.useContext(RegionContext);
}

/**
 * The content of a page form (US-QS-32, SG-SHEET-04, owner decision d-060): the one place that knows both positions of the
 * bar. Below `md` the bar of the form sticks at the top of the form; from `md` it is a plain row after the last field. The
 * `FormBar` stands last in the region, as the DOM order of the md position; below `md` it draws itself into the slot this
 * region keeps at the top, so there is one pair at a time, and the order of the DOM is the order of the picture in both.
 * The slot is `display: contents`, so the sticky bar sticks within the form itself. A form in a sheet, dialog or pane needs no
 * region: its container tells the bar where to go (`form-bar.host.ts`).
 */
export function FormBarRegion({ children }: { children: React.ReactNode }) {
  const [slot, setSlot] = React.useState<HTMLElement | null>(null);
  const value = React.useMemo(() => ({ slot }), [slot]);
  return (
    <RegionContext.Provider value={value}>
      <div ref={setSlot} className="contents" />
      {children}
    </RegionContext.Provider>
  );
}
