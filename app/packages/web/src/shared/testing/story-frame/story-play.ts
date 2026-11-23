/**
 * Helpers of the play functions of the component stories (P-B, issue 2432). A play runs in the story page after its render,
 * and the QG-U5 conformance run fails the story when it throws. It waits for what a keeper would see, with a deadline, and
 * names what did not happen. No test runner is involved.
 */

/** Resolves when `check` holds (polled every 25 ms); throws, naming `what`, when it does not hold within `timeout` ms. */
export async function waitUntil(check: () => boolean, what: string, timeout = 2000): Promise<void> {
  const deadline = performance.now() + timeout;
  while (!check()) {
    if (performance.now() > deadline)
      throw new Error(`play: ${what} did not happen within ${timeout} ms`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

/**
 * False without layout. The jsdom tests run every story's play too, and jsdom reports no client rects, so a play that
 * measures a box returns early when this is false and the browser run of the conformance judges it. An element with
 * `display: none` has no client rects either: keep the element of such a play visible in its story.
 */
export function hasLayout(element: Element): boolean {
  return element.getClientRects().length > 0;
}

/** Presses Escape, as a keyboard user does: the overlays listen for it on the document, so the event bubbles up from `target`. */
export function pressEscape(target: Element): void {
  target.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
  );
}
