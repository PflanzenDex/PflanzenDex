import { NavLink, useLocation } from "react-router";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { NavItem } from "./nav-item";

/** At most 5 slots in the bar (DS-25): 5 destinations, or 4 plus "Mehr". */
const BAR_SLOTS = 5;

const slot =
  "flex min-h-[44px] min-w-[44px] flex-1 flex-col items-center justify-center gap-1 rounded-md px-1 py-1 text-xs " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const state = (active: boolean) =>
  active
    ? "border-t-2 border-primary font-semibold text-foreground"
    : "border-t-2 border-transparent text-muted-foreground";

const isActive = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

/** The "Mehr" button and the slide-over drawer with the destinations that do not fit the bar (DS-25). */
function MoreDrawer({ items, active }: { items: NavItem[]; active: boolean }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Mehr"
          className={cn(slot, "h-auto whitespace-normal rounded-md", state(active))}
        >
          <span aria-hidden="true" className="text-lg leading-none">
            ⋯
          </span>
          <span>Mehr</span>
        </Button>
      </SheetTrigger>
      <SheetContent title="Mehr">
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.href}>
              <NavLink
                to={item.href}
                className={({ isActive }) =>
                  cn(
                    "flex min-h-[44px] items-center gap-3 rounded-md px-3 text-base hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isActive ? "bg-accent font-semibold" : "",
                  )
                }
              >
                {item.icon}
                {item.label}
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
 * stay in the bar, the rest move into the "Mehr" drawer. The active one is bold, has a top rule and
 * `aria-current`, so color is never the only signal (DS-19).
 */
export function MobileNavBar({ items }: { items: NavItem[] }) {
  const { pathname } = useLocation();
  const overflow = items.length > BAR_SLOTS;
  const inBar = overflow ? items.slice(0, BAR_SLOTS - 1) : items;
  const inDrawer = overflow ? items.slice(BAR_SLOTS - 1) : [];
  const moreActive = inDrawer.some((i) => isActive(pathname, i.href));

  return (
    <nav
      aria-label="Navigation unten"
      className="fixed inset-x-0 bottom-0 z-40 flex items-stretch gap-2 border-t border-border bg-background px-2 pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {inBar.map((item) => (
        <NavLink
          key={item.href}
          to={item.href}
          end={item.href === "/"}
          className={({ isActive: active }) => cn(slot, state(active))}
        >
          {item.icon}
          <span className="max-w-full truncate">{item.label}</span>
        </NavLink>
      ))}
      {overflow ? <MoreDrawer items={inDrawer} active={moreActive} /> : null}
    </nav>
  );
}
