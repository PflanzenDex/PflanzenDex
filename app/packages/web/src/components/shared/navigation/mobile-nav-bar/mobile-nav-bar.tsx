import { useState } from "react";
import { Ellipsis } from "lucide-react";
import { NavLink, useLocation } from "react-router";
import { Button } from "@/components/ui/button/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/overlays/sheet/sheet";
import { cn } from "@/lib/utils";
import {
  isActivePath,
  stackedItem,
  stackedLabel,
  stackedPill,
  type NavItem,
} from "../nav-model/nav-item";
import { NavNote } from "../nav-model/nav-note/nav-note";

/** At most 5 slots in the bar (DS-25): 5 destinations, or 4 plus "Mehr". */
const BAR_SLOTS = 5;

/**
 * The words under the icons (US-QS-15, owner decision 2026-11-01, issue 1107): a label never breaks inside a word. The
 * bar is a size container; once its inner width is below 21.75 rem (five slots of the longest label, "Sammlung" at
 * 4 rem, plus their padding and gaps), a label no longer fits its slot, so all labels leave the view and stay the
 * accessible name, and the bar shows icons only. The query is in rem, so a larger text size reaches it on a wider
 * screen (from about 110 % text at 360 px); at 100 % text the bar keeps its one line of labels.
 */
const barText = "flex max-w-full flex-col items-center gap-1 @max-[21.75rem]:sr-only";

/**
 * The "Mehr" button and the slide-over drawer with the destinations that do not fit the bar (DS-25). Choosing a
 * destination closes the drawer, so the new page is not left behind an overlay that holds the focus (US-QS-08).
 */
function MoreDrawer({ items, active }: { items: NavItem[]; active: boolean }) {
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
            "h-auto flex-1 rounded-none hover:bg-transparent",
            // Like the links beside it, the item has no box in forced colors; the icon pill shows the state (US-QS-14).
            "forced-colors:border-0",
            stackedLabel(active),
          )}
        >
          <span className={stackedPill(active)}>
            <Ellipsis aria-hidden="true" />
          </span>
          <span className={barText}>
            <span className="whitespace-nowrap">Mehr</span>
          </span>
        </Button>
      </SheetTrigger>
      <SheetContent title="Mehr">
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.href}>
              <NavLink
                to={item.href}
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
              </NavLink>
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Sticky bottom bar below `md` (US-QS-07, DS-25, DS-22). Takes plain items, never modules (DS-44): the first four
 * stay in the bar, the rest move into the "Mehr" drawer. The active one has the accent pill, a semibold label and
 * `aria-current`, so color is never the only signal (DS-19). Greenhouse look: ADR 0011 decision 6.
 */
export function MobileNavBar({ items }: { items: NavItem[] }) {
  const { pathname } = useLocation();
  const overflow = items.length > BAR_SLOTS;
  const inBar = overflow ? items.slice(0, BAR_SLOTS - 1) : items;
  const inDrawer = overflow ? items.slice(BAR_SLOTS - 1) : [];
  const moreActive = inDrawer.some((i) => isActivePath(pathname, i.href));

  return (
    <nav
      aria-label="Navigation unten"
      data-bottom-bar
      className="@container fixed inset-x-0 bottom-0 z-40 flex items-stretch gap-0.5 border-t border-border bg-card px-1 pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {inBar.map((item) => (
        <NavLink
          key={item.href}
          to={item.href}
          end={item.href === "/"}
          className={({ isActive: active }) => cn(stackedItem, "flex-1", stackedLabel(active))}
        >
          {({ isActive: active }) => (
            <>
              <span className={stackedPill(active)}>{item.icon}</span>
              <span className={barText}>
                <span className="whitespace-nowrap">{item.label}</span>
                <NavNote text={item.note} />
              </span>
            </>
          )}
        </NavLink>
      ))}
      {overflow ? <MoreDrawer items={inDrawer} active={moreActive} /> : null}
    </nav>
  );
}
