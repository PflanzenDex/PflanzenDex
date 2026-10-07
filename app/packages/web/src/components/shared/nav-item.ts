import type { ReactNode } from "react";

/** One navigation destination: data only, never a module or domain object (DS-44). */
export type NavItem = {
  href: string;
  /** German label shown next to or under the icon. */
  label: string;
  /** Decorative icon; the label carries the meaning (DS-17). */
  icon: ReactNode;
};

/** Same look for the bottom bar and the rail: a 56x30 px pill behind a 22 px icon, the label under it (ADR 0011 decision 6). */
export const stackedItem =
  "group flex min-h-[44px] shrink-0 min-w-[44px] flex-col items-center justify-center gap-1 px-0.5 py-1 text-center text-xs font-semibold " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** The pill is the selection (accent fill); the semibold foreground label and `aria-current` repeat it, so colour is never alone (DS-19). */
export const stackedPill = (active: boolean) =>
  "flex h-[30px] w-14 items-center justify-center rounded-full border border-transparent [&_svg]:size-[22px] " +
  (active
    ? "bg-accent text-accent-foreground forced-colors:border-[color:Highlight]"
    : "text-muted-foreground group-hover:bg-muted");

export const stackedLabel = (active: boolean) =>
  active ? "text-foreground" : "text-muted-foreground";

export const isActivePath = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
