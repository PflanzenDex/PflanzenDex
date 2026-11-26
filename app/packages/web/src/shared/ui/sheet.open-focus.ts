import * as React from "react";

/**
 * The controls Radix's focus on open tries, in document order (its FocusScope): tabbable, not disabled or hidden, and no
 * link. The close button, the handle and the toggle of the height (`data-sheet-chrome`, US-QS-15) and the actions of a
 * form bar (`data-form-bar`, SG-SHEET-04) are left out, so they never take the focus on open: they sit above the form's
 * fields in the DOM (US-QS-32, SG-SHEET-07).
 */
function openCandidates(root: HTMLElement, close: HTMLElement | null): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>("*")).filter(
    (el) =>
      el !== close &&
      !el.closest("[data-form-bar], [data-sheet-chrome]") &&
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

/** Vaul's focus on close: the caller's handler first, then the opener when it is still on the page. */
export function closeFocus(
  opener: { current: HTMLElement | null },
  next: ((e: Event) => void) | undefined,
) {
  return (e: Event) => {
    next?.(e);
    if (e.defaultPrevented) return;
    e.preventDefault();
    if (opener.current?.isConnected) opener.current.focus();
  };
}

/**
 * Vaul's focus on open: the opener is remembered, then the caller's handler runs, then the focus goes where Radix puts it
 * when the handler left it (`focusOnOpen`, which passes the close button over).
 */
export function openFocus(
  opener: { current: HTMLElement | null },
  close: { current: HTMLElement | null },
  next: ((e: Event) => void) | undefined,
) {
  return (e: Event) => {
    opener.current = document.activeElement as HTMLElement | null;
    next?.(e);
    if (!e.defaultPrevented) focusOnOpen(e, close.current);
  };
}

/**
 * The focus of a sheet on open and on close (US-QS-08, US-QS-32): the opener is remembered when the sheet opens and takes the
 * focus back when it closes, and the close button is passed over on open. The caller's own handlers run first. Gives the ref
 * of the close button and the two handlers of the sheet.
 */
export function useSheetFocus(
  onOpen: ((e: Event) => void) | undefined,
  onClose: ((e: Event) => void) | undefined,
) {
  // Radix returns focus through its Dialog.Trigger, which the sheet does not use, so remember the opener here.
  const opener = React.useRef<HTMLElement | null>(null);
  const close = React.useRef<HTMLButtonElement | null>(null);
  return {
    close,
    onOpenAutoFocus: openFocus(opener, close, onOpen),
    onCloseAutoFocus: closeFocus(opener, onClose),
  };
}
