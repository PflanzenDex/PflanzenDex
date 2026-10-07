import { Leaf } from "lucide-react";
import { Link, NavLink } from "react-router";
import { cn } from "@/lib/utils";
import { stackedItem, stackedLabel, stackedPill, type NavItem } from "../nav-item";

/**
 * Navigation rail from `md` to below `xl` (US-QS-14, ADR 0011 decision 6, DS-25): about 80 px wide (assumption),
 * icon with the label under it, all destinations from the one `items` list (DS-44). The brand mark on top links home,
 * so the way back to the start stays when the header is hidden. The active item has the accent pill, a semibold
 * label and `aria-current`, not colour alone (DS-19).
 */
function NavRail({ items, className }: { items: NavItem[]; className?: string }) {
  return (
    <nav
      aria-label="Navigation seitlich"
      data-side-nav="rail"
      className={cn(
        "sticky top-0 hidden h-dvh w-20 shrink-0 flex-col items-stretch gap-1 overflow-y-auto border-r border-border bg-card px-1 py-3 md:flex xl:hidden",
        className,
      )}
    >
      <Link
        to="/"
        aria-label="PflanzenDex, Start"
        className="mx-auto mb-2 flex size-11 shrink-0 items-center justify-center rounded-control bg-primary text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Leaf aria-hidden="true" className="size-5" />
      </Link>
      {items.map((item) => (
        <NavLink
          key={item.href}
          to={item.href}
          end={item.href === "/"}
          className={({ isActive }) => cn(stackedItem, "w-full", stackedLabel(isActive))}
        >
          {({ isActive }) => (
            <>
              <span className={stackedPill(isActive)}>{item.icon}</span>
              <span className="max-w-full break-words hyphens-auto">{item.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

/**
 * Labelled sidebar from `xl` (1280 px, US-QS-14, ADR 0011 decision 6, DS-25): 248 px wide, product name on top,
 * all destinations from the one `items` list (DS-44). The active item has the accent fill, a semibold label and
 * `aria-current`; in forced colours it also gets a border (DS-19, DS-37).
 */
function NavSidebar({ items, className }: { items: NavItem[]; className?: string }) {
  return (
    <nav
      aria-label="Hauptnavigation"
      data-side-nav="sidebar"
      className={cn(
        "sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col gap-1 overflow-y-auto border-r border-border bg-card p-3 xl:flex",
        className,
      )}
    >
      <Link
        to="/"
        className="mb-3 flex min-h-[44px] shrink-0 items-center gap-3 rounded-control px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-control bg-primary text-primary-foreground">
          <Leaf aria-hidden="true" className="size-5" />
        </span>
        <span className="text-xl font-bold">PflanzenDex</span>
      </Link>
      {items.map((item) => (
        <NavLink
          key={item.href}
          to={item.href}
          end={item.href === "/"}
          className={({ isActive }) =>
            cn(
              "flex min-h-[44px] shrink-0 items-center gap-3 rounded-control border border-transparent px-3 text-[15px] font-semibold [&_svg]:size-[22px] [&_svg]:shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isActive
                ? "bg-accent text-accent-foreground forced-colors:border-[color:Highlight]"
                : "text-muted-foreground hover:bg-muted",
            )
          }
        >
          {item.icon}
          <span className="min-w-0 break-words">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

/**
 * Side navigation (US-QS-14, ADR 0011 decision 6, DS-25): the rail from `md`, the labelled sidebar from `xl`, both
 * rendered from the one `items` list (DS-44). `show` forces one form visible; stories and tests use it, the app keeps "auto".
 */
export function SideNav({
  items,
  show = "auto",
}: {
  items: NavItem[];
  show?: "auto" | "rail" | "sidebar";
}) {
  return (
    <>
      <NavRail
        items={items}
        className={show === "rail" ? "flex" : show === "sidebar" ? "hidden" : ""}
      />
      <NavSidebar
        items={items}
        className={show === "sidebar" ? "flex" : show === "rail" ? "hidden" : ""}
      />
    </>
  );
}
