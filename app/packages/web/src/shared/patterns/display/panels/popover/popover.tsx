import * as React from "react";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";
import { popupAlignClass, popupPanelClass, usePopup, type PopupAlign } from "./use-popup";

export type PopoverProps = {
  /** Accessible name of the panel and of an icon-only trigger. */
  label: string;
  /** Trigger content; without it the label is the visible text. With an icon-only trigger the label is its name. */
  trigger?: React.ReactNode;
  align?: PopupAlign;
  children: React.ReactNode;
  className?: string;
};

/**
 * Popover (US-QS-07, DS-34): a non-modal panel opened by a button with `aria-expanded` and `aria-controls`. Focus moves
 * into the panel on open; Escape, a press outside or tabbing out closes it, and Escape returns focus to the trigger.
 * Not for essential content or tooltips (QG-U5: no hover-only information): the panel opens on click and key only.
 * It sits below the trigger and does not flip at the viewport edge; keep it short.
 *
 * US-QS-32 (F-0209, F-0356): the panel is moved sideways to stay 16 px inside both window edges and is at most 100vw minus
 * 32 px wide; Escape and a press outside close the popover only, not a dialog, sheet or layer pane around it (`usePopup`).
 */
export function Popover(props: PopoverProps) {
  const { open, setOpen, rootRef, triggerRef, panelRef } = usePopup();
  const id = React.useId();
  React.useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open, panelRef]);
  return (
    <div ref={rootRef} className={cn("relative inline-block", props.className)}>
      <Button
        ref={triggerRef}
        type="button"
        variant="tinted"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? id : undefined}
        {...(props.trigger ? { "aria-label": props.label } : {})}
        onClick={() => setOpen(!open)}
      >
        {props.trigger ?? props.label}
      </Button>
      {open ? (
        <div
          ref={panelRef}
          id={id}
          role="dialog"
          aria-label={props.label}
          tabIndex={-1}
          className={cn(
            popupPanelClass,
            popupAlignClass(props.align ?? "start"),
            "w-72 p-4 focus-visible:outline-none",
          )}
        >
          {props.children}
        </div>
      ) : null}
    </div>
  );
}
