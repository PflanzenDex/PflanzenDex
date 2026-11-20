// The start of a view (DS-68, DS-40): its main heading, or the main region when it has none. Small and static, so an overlay
// can return the focus here without loading the focus handling of RouteFocus, which is a chunk of its own (DS-08).

// The heading of a route's loading skeleton is not the view's own (issue 1097): focusing it would lose the focus when the page replaces it.
// Below `md` the page's heading may sit in the top bar (US-QS-32, SG-HEAD-01): the bar's heading is the view's own, then the main one.
export const mainHeading = () =>
  document.querySelector<HTMLElement>("[data-app-bar-slot] h1:not([data-route-fallback])") ??
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

// The title a route claims for the page it shows itself (US-QS-09): the not-found view claims its title here, because the address
// alone does not say that no page exists. RouteFocus reads the claim before it sets the title of an address; the view releases it
// when it leaves, so the title of the next address counts again.
let claimed: string | null = null;

/** Claims the title of the page the route shows; the returned function releases it when the route leaves. */
export function claimTitle(title: string): () => void {
  claimed = title;
  return () => {
    if (claimed === title) claimed = null;
  };
}

/** The title a route has claimed, or `null`: the address decides then. */
export const claimedTitle = (): string | null => claimed;
