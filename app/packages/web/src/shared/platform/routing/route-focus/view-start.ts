// The start of a view (DS-68, DS-40): its main heading, or the main region when it has none. Small and static, so an overlay
// can return the focus here without loading the focus handling of RouteFocus, which is a chunk of its own (DS-08).

// The heading of a route's loading skeleton is not the view's own (issue 1097): focusing it would lose the focus when the page replaces it.
export const mainHeading = () =>
  document.querySelector<HTMLElement>("#inhalt h1:not([data-route-fallback])");
export const mainRegion = () => document.getElementById("inhalt");

/** Focuses `el`; a heading that cannot take the focus gets `tabindex="-1"` first. True when it has the focus afterwards. */
export function focusIt(el: HTMLElement): boolean {
  if (!el.hasAttribute("tabindex") && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(el.tagName))
    el.setAttribute("tabindex", "-1");
  el.focus({ preventScroll: false });
  return document.activeElement === el;
}

/**
 * Puts the focus back after an overlay closed (US-QS-08, DS-40): on `opener` when it is still on the page, otherwise on
 * the start of the view. A closed overlay leaves the focus on `body`, so the focus is only moved then: a control that
 * already has it (for example one the route focus has just set after a Back navigation) keeps it.
 */
export function returnFocus(opener: HTMLElement | null | undefined): void {
  const active = document.activeElement;
  if (active && active !== document.body) return;
  const usable = opener && opener !== document.body && opener.isConnected ? opener : null;
  const target = usable ?? mainHeading() ?? mainRegion();
  if (target) focusIt(target);
}

/**
 * The close handler of an overlay that returns the focus to `opener` (US-QS-08), which replaces Radix's own return to its
 * trigger. Without an opener there is no handler, and Radix keeps its default.
 */
export function returnFocusOnClose(opener: { readonly current: HTMLElement | null } | undefined) {
  if (!opener) return undefined;
  return (event: Event) => {
    event.preventDefault();
    returnFocus(opener.current);
  };
}
