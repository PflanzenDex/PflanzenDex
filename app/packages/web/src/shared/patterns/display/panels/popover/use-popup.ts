import * as React from "react";

/** The gap an open panel keeps to both edges of the window, in px (US-QS-32, F-0209). */
const POPUP_EDGE_GAP = 16;

/**
 * Moves an open panel sideways until it is `POPUP_EDGE_GAP` px inside both window edges (US-QS-32, F-0209). The panel is
 * aligned to its trigger, so near an edge, or at 200 % text on a 360 px phone, it would stick out. The shift is reset
 * before each measure, so shifts never add up; the width stays, because `popupPanelClass` caps it at 100vw minus 32 px.
 */
function keepInWindow(panel: HTMLElement): void {
  panel.style.transform = "";
  const { left, right } = panel.getBoundingClientRect();
  let shift = 0;
  if (left < POPUP_EDGE_GAP) shift = POPUP_EDGE_GAP - left;
  else if (right > window.innerWidth - POPUP_EDGE_GAP)
    shift = window.innerWidth - POPUP_EDGE_GAP - right;
  if (shift !== 0) panel.style.transform = `translateX(${shift}px)`;
}

/**
 * The popups that are open, outermost first (US-QS-32). Only the topmost one answers Escape, so one Escape closes one
 * popup: a Menu inside an open Popover closes first, and the Popover on the next Escape.
 */
const openPopups: object[] = [];

/**
 * Open state shared by Popover and Menu (US-QS-07, US-QS-32). While open it closes on Escape (focus returns to the trigger),
 * on a press outside and when focus leaves the root; it keeps the open panel inside the window (`keepInWindow`), measured
 * when it opens and on every resize. Listeners exist only while open, so closed popups cost nothing.
 *
 * Escape and a press outside are caught on `window` in the capture phase (US-QS-32, F-0356). A Radix dialog or a Vaul
 * sheet around the popup listens on `document` and would close with it, and a layer pane would take the Escape in its
 * React handler. The topmost popup stops the Escape there. A press outside stops there only when it lands on the backdrop
 * of the layer around the popup (a dialog, a sheet or a layer pane); a press on another control of that layer, or with no
 * layer around the popup, reaches its target, because that control may act on `pointerdown`. Focus leaving the root still
 * closes the popup on `document`, as before.
 */
export function usePopup() {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const close = React.useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);
  React.useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!open || !panel) return;
    const keep = () => keepInWindow(panel);
    keep();
    window.addEventListener("resize", keep);
    return () => window.removeEventListener("resize", keep);
  }, [open]);
  React.useEffect(() => {
    if (!open) return;
    const token = {};
    openPopups.push(token);
    const inside = (target: EventTarget | null) =>
      rootRef.current?.contains(target as Node) ?? false;
    const outside = (event: PointerEvent) => {
      if (inside(event.target)) return;
      const layer = rootRef.current?.closest('[role="dialog"], [data-layer-pane]') ?? null;
      if (layer && !layer.contains(event.target as Node)) event.stopPropagation();
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || openPopups[openPopups.length - 1] !== token) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
    };
    const onFocus = (event: FocusEvent) => {
      if (!inside(event.target)) setOpen(false);
    };
    window.addEventListener("pointerdown", outside, true);
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("focusin", onFocus);
    return () => {
      const index = openPopups.indexOf(token);
      if (index !== -1) openPopups.splice(index, 1);
      window.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("focusin", onFocus);
    };
  }, [open, close]);
  return { open, setOpen, close, rootRef, triggerRef, panelRef };
}

export type PopupAlign = "start" | "end";

/** The panel of a popup: at most 20 rem, and never wider than the window less 16 px on each side (US-QS-32, F-0209). */
export const popupPanelClass =
  "absolute top-full z-30 mt-2 max-w-[min(20rem,calc(100vw-32px))] rounded-card border border-border bg-card p-2 text-card-foreground shadow-elevation-2 forced-colors:border-[CanvasText]";

export const popupAlignClass = (align: PopupAlign) => (align === "end" ? "right-0" : "left-0");
