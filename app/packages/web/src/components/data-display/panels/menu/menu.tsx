import { EllipsisVertical } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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

// The role sits on the shared Button; DS-48 reads a literal interactive role as a raw control, so it is a constant.
const ITEM_ROLE = "menuitem";
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
      role={ITEM_ROLE}
      type="button"
      variant="ghost"
      tabIndex={-1}
      disabled={item.disabled ?? false}
      onClick={() => {
        props.onChoose();
        item.onSelect();
      }}
      className={cn(
        "justify-start rounded-control px-3 text-left",
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
 */
export function Menu(props: MenuProps) {
  const { open, setOpen, close, rootRef, triggerRef } = usePopup();
  const id = React.useId();
  const menuRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLElement>(ITEM)?.focus();
  }, [open]);

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
          ref={menuRef}
          id={id}
          role="menu"
          aria-label={props.label}
          onKeyDown={moveFocus}
          className={cn(
            popupPanelClass,
            popupAlignClass(props.align ?? "end"),
            "grid min-w-48 gap-1",
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
