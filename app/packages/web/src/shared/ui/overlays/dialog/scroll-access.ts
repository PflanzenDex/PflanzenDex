import * as React from "react";

/** What a keyboard can reach inside a region: a control, a link, or something that is a tab stop. */
const FOCUSABLE =
  "a[href], button:not([disabled]), input:not([disabled]):not([type='hidden']), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex='-1'])";

/** What the hook sets on a region that needs keyboard access, and takes off again. */
const ACCESS = ["tabindex", "role", "aria-labelledby"];

/** The region scrolls, and nothing in it takes the keyboard: its content is out of reach unless the region itself is a tab stop. */
function needsAccess(region: HTMLElement): boolean {
  return region.scrollHeight - region.clientHeight > 1 && region.querySelector(FOCUSABLE) === null;
}

/**
 * Keyboard access to a scroll region (WCAG 2.1.1, axe `scrollable-region-focusable`; US-QS-15): while the region scrolls and
 * holds no control, it is a tab stop that the arrow keys scroll, named as the layer around it is (the nearest element with an
 * `aria-labelledby`: the dialog, the sheet or the pane). A region with a control in it, or one that does not scroll, is no
 * extra tab stop: the controls give the access, and a keeper does not tab over a box that has nothing to scroll. The attributes
 * are the hook's, written to the element and not by React, so the region must not set them itself. A region follows its own size,
 * its content and the window.
 */
export function useScrollAccess(region: HTMLElement | null): void {
  React.useLayoutEffect(() => {
    if (!region) return;
    const update = () => {
      if (!needsAccess(region)) {
        ACCESS.forEach((name) => region.removeAttribute(name));
        return;
      }
      region.setAttribute("tabindex", "0");
      region.setAttribute("role", "region");
      const label = region.closest("[aria-labelledby]")?.getAttribute("aria-labelledby");
      if (label) region.setAttribute("aria-labelledby", label);
    };
    update();
    let frame = 0;
    const later = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    const resize = typeof ResizeObserver === "function" ? new ResizeObserver(later) : null;
    resize?.observe(region);
    const mutation = new MutationObserver(later);
    mutation.observe(region, { subtree: true, childList: true, characterData: true });
    window.addEventListener("resize", later);
    return () => {
      cancelAnimationFrame(frame);
      resize?.disconnect();
      mutation.disconnect();
      window.removeEventListener("resize", later);
    };
  }, [region]);
}
