import { Link, NavLink } from "react-router";
import { cn } from "@/lib/utils";
import type { NavItem } from "./nav-item";

/**
 * Top bar (US-QS-07, DS-25): the brand on every width, from `md` all destinations as a row (the bottom bar is
 * hidden there, DS-14). Takes plain items (DS-44). The active one is bold and `aria-current`, not color alone (DS-19).
 */
export function GlobalHeader({ items }: { items: NavItem[] }) {
  return (
    <header className="sticky top-0 z-40 flex items-center gap-4 border-b border-border bg-background px-4 pt-[env(safe-area-inset-top)] md:px-6">
      <Link
        to="/"
        className="flex min-h-[44px] items-center text-lg font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        PflanzenDex
      </Link>
      <nav aria-label="Hauptnavigation" className="hidden min-w-0 flex-1 flex-wrap gap-x-2 md:flex">
        {items.map((item) => (
          <NavLink
            key={item.href}
            to={item.href}
            end={item.href === "/"}
            className={({ isActive }) =>
              cn(
                "flex min-h-[44px] items-center gap-2 rounded-md px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isActive
                  ? "border-b-2 border-primary font-semibold text-foreground"
                  : "border-b-2 border-transparent text-muted-foreground hover:text-foreground",
              )
            }
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}
