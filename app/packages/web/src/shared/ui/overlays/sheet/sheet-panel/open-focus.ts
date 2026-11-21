/**
 * The controls Radix's focus on open tries, in document order (its FocusScope): tabbable, not disabled or hidden, and no
 * link. The close button is left out, so it never takes the focus on open (US-QS-32, SG-SHEET-07).
 */
function openCandidates(root: HTMLElement, close: HTMLElement | null): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>("*")).filter(
    (el) =>
      el !== close &&
      el.tabIndex >= 0 &&
      el.tagName !== "A" &&
      !el.matches(":disabled") &&
      !el.hidden &&
      !(el instanceof HTMLInputElement && el.type === "hidden"),
  );
}

/**
 * Radix's focus on open, which Vaul keeps with `autoFocus`: the first candidate that takes the focus, or the sheet itself
 * when none does. A sheet without a focus of its own (the menu "Mehr", a form for a new entry) keeps it where it was
 * before the close button existed; the close button is only passed over (US-QS-32). Runs after the caller's handler, and
 * only when that handler did not take the focus itself.
 */
export function focusOnOpen(event: Event, close: HTMLElement | null): void {
  event.preventDefault();
  const root = event.currentTarget as HTMLElement;
  const before = document.activeElement;
  for (const el of openCandidates(root, close)) {
    el.focus({ preventScroll: true });
    if (el !== before && el instanceof HTMLInputElement) el.select();
    if (document.activeElement !== before) return;
  }
  root.focus({ preventScroll: true });
}
