import { EllipsisVertical } from "lucide-react";
import * as React from "react";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";
import { popupAlignClass, popupPanelClass, usePopup, type PopupAlign } from "../popover/use-popup";

export type MenuItem = {
  label: string;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
};

export type MenuProps = {
  /** Accessible name of the trigger and the menu, e.g. "Weitere Aktionen" (German). */
  label: string;
  items: readonly MenuItem[];
  align?: PopupAlign;
  className?: string;
};

const ITEM = '[role="menuitem"]:not(:disabled)';

/** Moves focus over the enabled items for Up, Down, Home and End (wrapping). */
function moveFocus(event: React.KeyboardEvent<HTMLElement>) {
  const list = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(ITEM));
  const at = list.indexOf(document.activeElement as HTMLElement);
  const to = {
    ArrowDown: (at + 1) % list.length,
    ArrowUp: (at <= 0 ? list.length : at) - 1,
    Home: 0,
    End: list.length - 1,
  }[event.key];
  if (to === undefined) return;
  event.preventDefault();
  list[to]?.focus();
}

function MenuRow(props: { item: MenuItem; onChoose: () => void }) {
  const { item } = props;
  return (
    <Button
      role="menuitem"
      type="button"
      variant="ghost"
      tabIndex={-1}
      disabled={item.disabled ?? false}
      onClick={() => {
        props.onChoose();
        item.onSelect();
      }}
      className={cn(
        // The text wraps and the row grows with it: at 200 % text no entry is cut (US-QS-32, F-0209). A row keeps the
        // Button's min-height, not a fixed one, and `whitespace-normal` holds even under an inherited nowrap.
        "justify-start whitespace-normal rounded-control px-3 text-left",
        item.destructive && "text-destructive hover:text-destructive",
      )}
    >
      {item.label}
    </Button>
  );
}

/**
 * Dropdown menu for overflow actions (US-QS-07, DS-34): an icon button with `aria-haspopup="menu"` and a `menu` of
 * `menuitem` buttons with roving focus. Enter, Space, a click or ArrowDown on the trigger opens it on the first item;
 * Up, Down, Home and End move; choosing runs the action and returns focus to the trigger; Escape does the same
 * without an action; Tab leaves and closes. Only for secondary actions: the main action stays a visible button.
 *
 * US-QS-32 (F-0209, F-0356): the menu stays at least 16 px inside both window edges, its width is at most 100vw minus
 * 32 px and its entries wrap instead of being cut. Escape and a press outside close the menu only, not a dialog, sheet
 * or layer pane around it (`usePopup`).
 */
export function Menu(props: MenuProps) {
  const { open, setOpen, close, rootRef, triggerRef, panelRef } = usePopup();
  const id = React.useId();
  React.useEffect(() => {
    if (open) panelRef.current?.querySelector<HTMLElement>(ITEM)?.focus();
  }, [open, panelRef]);

  return (
    <div ref={rootRef} className={cn("relative inline-block", props.className)}>
      <Button
        ref={triggerRef}
        type="button"
        variant="ghost"
        size="icon"
        aria-label={props.label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown") return;
          event.preventDefault();
          setOpen(true);
        }}
      >
        <EllipsisVertical aria-hidden="true" className="size-5" />
      </Button>
      {open ? (
        <div
          ref={panelRef}
          id={id}
          role="menu"
          aria-label={props.label}
          onKeyDown={moveFocus}
          className={cn(
            popupPanelClass,
            popupAlignClass(props.align ?? "end"),
            // A rem minimum grows with the text size and would exceed the window at 200 %; the px cap keeps it inside.
            "grid min-w-[min(12rem,calc(100vw-32px))] gap-1",
          )}
        >
          {props.items.map((item) => (
            <MenuRow key={item.label} item={item} onChoose={close} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
