import { useState } from "react";
import { Clock, Ellipsis, Lock } from "lucide-react";
import { useLocation } from "react-router";
import { Button } from "@/shared/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/shared/ui/sheet";
import { cn } from "@/shared/lib/utils";
import {
  BAR_SHOW_CLASS,
  barSlot,
  barWords,
  barWordsStyle,
  bottomBar,
  stackedItem,
  stackedLabel,
  stackedPill,
  type BarShow,
  type NavItem,
} from "../../../shared/patterns/navigation/nav-item";
import { NavNote } from "../../../shared/patterns/navigation/nav-note/nav-note";
import { barSlotsOf } from "./bar-slots";
import {
  ReselectLink,
  isActivePath,
} from "../../../shared/patterns/navigation/navigation/reselect-link/reselect-link";

/**
 * The label of a slot. With a text mark the accessible name reads "Freunde, Noch gesperrt" with no blank before the comma
 * (F-0055): an absolutely placed element (sr-only) counts as a block for the accessible name and gets a blank before it, so
 * the words for assistive technology are one element that holds the label and the mark, and the visible label is hidden
 * from them.
 */
function BarWords({ label, note }: { label: string; note: string | undefined }) {
  if (!note)
    return (
      <span className={barWords} style={barWordsStyle(label)}>
        {label}
      </span>
    );
  return (
    <>
      <span aria-hidden="true" className={barWords} style={barWordsStyle(label)}>
        {label}
      </span>
      <span className="sr-only">
        {label}, {note}
      </span>
    </>
  );
}

/**
 * The mark of a destination that is not open yet, in the bar (US-ONB-05, issue 1830, F-0055): a lock ("Noch gesperrt") or a
 * clock ("Bald") in the upper right corner of the icon. It is 12 px with an 8 px glyph, set in px, so it stays the icon's
 * size at a larger text size and inside its slot. It sits in the pill (which is `relative`), so the pill stays the link's
 * first child. Plain, no colour alarm and no motion (FR-ONB-08); the words are for assistive technology (`BarWords`).
 */
function LockMark({ note }: { note: string | undefined }) {
  if (!note) return null;
  const Icon = note === "Bald" ? Clock : Lock;
  return (
    <span
      aria-hidden="true"
      data-lock-mark={note === "Bald" ? "soon" : "locked"}
      className="absolute left-1/2 top-[-4px] ml-[6px] flex size-[12px] items-center justify-center rounded-full border border-border bg-card text-muted-foreground"
    >
      <Icon className="size-[8px]" strokeWidth={2.5} />
    </span>
  );
}

/**
 * The "Mehr" button and the slide-over drawer with the destinations that do not fit the bar (DS-25). `show` is the text size
 * the button shows at (`barSlotsOf`): a bar has one "Mehr" per size, and CSS shows the one of its size, so the drawer of the
 * other is never opened. Choosing a destination closes the drawer, so the new page is not left behind an overlay that holds
 * the focus (US-QS-08).
 */
function MoreDrawer({ items, show, active }: { items: NavItem[]; show: BarShow; active: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Mehr"
          className={cn(
            stackedItem,
            barSlot,
            BAR_SHOW_CLASS[show],
            "h-auto flex-1 rounded-none hover:bg-transparent",
            // Like the links beside it, the item has no box in forced colors; the icon pill shows the state (US-QS-14).
            "forced-colors:border-0",
            stackedLabel(active),
          )}
        >
          <span className={stackedPill(active)}>
            <Ellipsis aria-hidden="true" />
          </span>
          <BarWords label="Mehr" note={undefined} />
        </Button>
      </SheetTrigger>
      <SheetContent title="Mehr">
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.href}>
              <ReselectLink
                item={item}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "flex min-h-[44px] items-center gap-3 rounded-control px-3 text-base hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isActive ? "bg-accent font-semibold" : "",
                  )
                }
              >
                {item.icon}
                {item.label}
                <NavNote text={item.note} inline />
              </ReselectLink>
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Fixed bottom bar below `md` (US-QS-07, DS-25, DS-22). Takes plain items, never modules (DS-44): the first four
 * stay in the bar, the rest move into the "Mehr" drawer. At a large text size "Entdecken" moves into the drawer too, and the
 * bar shows a second "Mehr" for it (SG-NAV-07, issue 2249); the slots come from `barSlotsOf`, and CSS shows the layout of the
 * text size. The selected one has the accent pill with its boundary, a semibold label and `aria-current`, so colour is never
 * the only signal (DS-19, SG-COLOR-05); the others have a regular label. A tap
 * on the selected destination goes to its start page, and a second tap scrolls to the top (SG-NAV-03). Greenhouse look:
 * ADR 0011 decision 6. It follows the content in the flow, after `main`, so it stays reachable at the end of the page
 * (US-QS-14); from 30 rem of window height (the `tall-window` variant) it is fixed to the window bottom.
 */
export function MobileNavBar({ items }: { items: NavItem[] }) {
  const { pathname } = useLocation();
  return (
    <nav aria-label="Navigation unten" data-bottom-bar className={bottomBar}>
      {barSlotsOf(items).map((slot) => {
        if ("drawer" in slot)
          return (
            <MoreDrawer
              key={`more-${slot.show}`}
              items={slot.drawer}
              show={slot.show}
              active={slot.drawer.some((i) => isActivePath(pathname, i.href))}
            />
          );
        const { item, show } = slot;
        return (
          <ReselectLink
            key={item.href}
            item={item}
            end={item.href === "/"}
            className={({ isActive: active }) =>
              cn(stackedItem, barSlot, BAR_SHOW_CLASS[show], "flex-1", stackedLabel(active))
            }
          >
            {({ isActive: active }) => (
              <>
                <span className={stackedPill(active)}>
                  {item.icon}
                  <LockMark note={item.note} />
                </span>
                <BarWords label={item.label} note={item.note} />
              </>
            )}
          </ReselectLink>
        );
      })}
    </nav>
  );
}
