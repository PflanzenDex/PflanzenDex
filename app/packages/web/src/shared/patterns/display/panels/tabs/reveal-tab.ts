import * as React from "react";

/**
 * Scrolls the strip sideways until the tab is inside it, with the half of the next tab showing at the trailing edge: the inline
 * nearest rule of scrollIntoView, limited to the strip. scrollIntoView itself would also move the page when the tabs are below
 * the fold on load (US-QS-15). A strip without layout (jsdom) does not move.
 */
function revealTab(strip: HTMLElement, tab: HTMLElement): void {
  const box = strip.getBoundingClientRect();
  const at = tab.getBoundingClientRect();
  const next = tab.nextElementSibling?.getBoundingClientRect();
  const end = next ? at.right + next.width / 2 : at.right;
  if (at.left < box.left) strip.scrollLeft += at.left - box.left;
  else if (end > box.right) strip.scrollLeft += end - box.right;
}

/** The selected tab is in view when the strip scrolls sideways (US-QS-15, issue 2417), on load and on every change. */
export function useRevealTab(
  list: React.RefObject<HTMLDivElement | null>,
  selected: string | undefined,
  wrap: boolean | undefined,
) {
  React.useEffect(() => {
    const strip = list.current;
    const tab = strip?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (strip && tab && !wrap) revealTab(strip, tab);
  }, [list, selected, wrap]);
}
