import * as React from "react";

/**
 * Open state shared by Popover and Menu (US-QS-07): closes on Escape (focus returns to the trigger), on a press outside
 * and when focus leaves the root. Listeners exist only while open, so closed popups cost nothing.
 */
export function usePopup() {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const close = React.useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);
  React.useEffect(() => {
    if (!open) return;
    const outside = (event: Event) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return { open, setOpen, close, rootRef, triggerRef };
}

export type PopupAlign = "start" | "end";

export const popupPanelClass =
  "absolute top-full z-30 mt-2 max-w-[min(20rem,calc(100vw-2rem))] rounded-card border border-border bg-card p-2 text-card-foreground shadow-elevation-2 forced-colors:border-[CanvasText]";

export const popupAlignClass = (align: PopupAlign) => (align === "end" ? "right-0" : "left-0");
