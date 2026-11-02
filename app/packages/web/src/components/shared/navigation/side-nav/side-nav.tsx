import { Fragment } from "react";
import { Leaf } from "lucide-react";
import { Link, NavLink } from "react-router";
import { cn } from "@/lib/utils";
import {
  BRAND_HREF,
  BRAND_LINK_LABEL,
  DISPLAY_NAME,
  stackedItem,
  stackedLabel,
  stackedPill,
  type NavItem,
} from "../nav-model/nav-item";
import { NavNote } from "../nav-model/nav-note/nav-note";

/**
 * The first four destinations are the primary ones (the bottom bar); a hairline separates the rest in the sidebar, and
 * the role entries stand under the heading "Verwaltung" there (issue 1093).
 */
const PRIMARY = 4;

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
        "sticky top-0 hidden h-dvh w-20 shrink-0 flex-col items-stretch overflow-hidden border-r border-border bg-card px-1 pt-3 md:flex xl:hidden",
        className,
      )}
    >
      <Link
        to={BRAND_HREF}
        aria-label={BRAND_LINK_LABEL}
        className="mx-auto mb-2 flex size-11 shrink-0 items-center justify-center rounded-control bg-primary text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Leaf aria-hidden="true" className="size-5" />
      </Link>
      <div className="flex min-h-0 flex-1 scroll-py-3 flex-col gap-1 overflow-y-auto pb-3">
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
                <NavNote text={item.note} />
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

type Run = { group: string | undefined; items: { item: NavItem; index: number }[] };

/** Consecutive items of the same group form one run; a run with a group gets its heading (issue 1093). */
function runs(items: NavItem[]): Run[] {
  const out: Run[] = [];
  items.forEach((item, index) => {
    const last = out.at(-1);
    if (last && last.group === item.group) last.items.push({ item, index });
    else out.push({ group: item.group, items: [{ item, index }] });
  });
  return out;
}

const groupId = (group: string) => `nav-group-${group.toLowerCase()}`;

/** One entry of the sidebar; a hairline stands before the first entry after the primary ones. */
function SidebarLink({ item, index, total }: { item: NavItem; index: number; total: number }) {
  return (
    <Fragment>
      {index === PRIMARY && total > PRIMARY ? <hr className="my-2 shrink-0 border-border" /> : null}
      <NavLink
        to={item.href}
        end={item.href === "/"}
        className={({ isActive }) =>
          cn(
            "flex min-h-[44px] shrink-0 items-center gap-3 rounded-control border border-transparent px-3 text-base font-semibold [&_svg]:size-[22px] [&_svg]:shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            isActive
              ? "bg-accent text-accent-foreground forced-colors:border-[color:Highlight]"
              : "text-muted-foreground hover:bg-muted",
          )
        }
      >
        {item.icon}
        <span className="min-w-0 break-words">{item.label}</span>
        <NavNote text={item.note} inline />
      </NavLink>
    </Fragment>
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
        "sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col overflow-hidden border-r border-border bg-card px-3 pt-3 xl:flex",
        className,
      )}
    >
      <Link
        to={BRAND_HREF}
        aria-label={BRAND_LINK_LABEL}
        className="mb-3 flex min-h-[44px] shrink-0 items-center gap-3 rounded-control px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-control bg-primary text-primary-foreground">
          <Leaf aria-hidden="true" className="size-5" />
        </span>
        <span className="text-xl font-bold">{DISPLAY_NAME}</span>
      </Link>
      <div className="flex min-h-0 flex-1 scroll-py-3 flex-col gap-1 overflow-y-auto pb-3">
        {runs(items).map((run) =>
          run.group ? (
            <div
              key={run.group}
              role="group"
              aria-labelledby={groupId(run.group)}
              className="flex shrink-0 flex-col gap-1"
            >
              <p
                id={groupId(run.group)}
                className="mt-2 px-3 text-xs font-semibold text-muted-foreground"
              >
                {run.group}
              </p>
              {run.items.map(({ item, index }) => (
                <SidebarLink key={item.href} item={item} index={index} total={items.length} />
              ))}
            </div>
          ) : (
            <Fragment key={run.items[0]?.item.href}>
              {run.items.map(({ item, index }) => (
                <SidebarLink key={item.href} item={item} index={index} total={items.length} />
              ))}
            </Fragment>
          ),
        )}
      </div>
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
